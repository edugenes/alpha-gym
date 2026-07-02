import { getDb } from "./client.js";
function run(sql, params) {
    const db = getDb();
    return db.query(sql, params || []).then(() => { });
}
export async function ensureUsersTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('administrador', 'recepcionista', 'professor')),
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
    for (const col of ["employee_id INTEGER", "active INTEGER NOT NULL DEFAULT 1"]) {
        try {
            await run(`ALTER TABLE users ADD COLUMN ${col}`);
        }
        catch { /* já existe */ }
    }
}
export async function ensureStudentsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      birth_date TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      photo_url TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inadimplente', 'cancelado')),
      plan_name TEXT,
      due_date TEXT,
      password_hash TEXT,
      biometric_device_ref TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
    // Migrações pontuais para bancos existentes
    for (const col of ["password_hash", "biometric_device_ref", "sex", "gender"]) {
        try {
            await run(`ALTER TABLE students ADD COLUMN ${col} TEXT`);
        }
        catch { /* já existe */ }
    }
}
export async function ensurePlansTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      plan_type TEXT NOT NULL CHECK (plan_type IN ('mensal', 'trimestral', 'semestral', 'anual')),
      price REAL NOT NULL CHECK (price >= 0),
      duration_days INTEGER NOT NULL CHECK (duration_days > 0),
      features TEXT,
      is_popular INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
export async function ensureEnrollmentsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
    try {
        await run(`ALTER TABLE enrollments ADD COLUMN employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL`);
    }
    catch { /* já existe */ }
}
export async function ensureInstallmentsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      plan_id INTEGER REFERENCES plans(id),
      due_date TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
      paid_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
export async function ensureAssessmentsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      evaluator_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      assessment_date TEXT NOT NULL,
      weight_kg REAL,
      height_cm REAL,
      bmi REAL,
      protocol TEXT,
      body_fat_percent REAL,
      body_density REAL,
      lean_mass_kg REAL,
      goal TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
    // Migração graceful: adicionar novas colunas se a tabela antiga já existir
    const newCols = [
        ["evaluator_id", "INTEGER"],
        ["weight_kg", "REAL"],
        ["height_cm", "REAL"],
        ["bmi", "REAL"],
        ["protocol", "TEXT"],
        ["body_fat_percent", "REAL"],
        ["body_density", "REAL"],
        ["lean_mass_kg", "REAL"],
        ["goal", "TEXT"],
    ];
    for (const [col, type] of newCols) {
        try {
            await run(`ALTER TABLE assessments ADD COLUMN ${col} ${type}`);
        }
        catch { /* já existe */ }
    }
    // Migrar dados antigos (weight → weight_kg, height → height_cm, fat_percent → body_fat_percent)
    try {
        await run(`UPDATE assessments SET weight_kg = CAST(weight AS REAL) WHERE weight_kg IS NULL AND weight IS NOT NULL`);
        await run(`UPDATE assessments SET height_cm = CAST(height AS REAL) WHERE height_cm IS NULL AND height IS NOT NULL`);
        await run(`UPDATE assessments SET body_fat_percent = CAST(fat_percent AS REAL) WHERE body_fat_percent IS NULL AND fat_percent IS NOT NULL`);
    }
    catch { /* colunas antigas podem não existir */ }
}
export async function ensureAssessmentMeasurementsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS assessment_measurements (
      assessment_id INTEGER PRIMARY KEY REFERENCES assessments(id) ON DELETE CASCADE,
      neck REAL, shoulder REAL, chest REAL, waist REAL, abdomen REAL, hip REAL,
      arm_relaxed_right REAL, arm_relaxed_left REAL,
      arm_flexed_right REAL, arm_flexed_left REAL,
      forearm_right REAL, forearm_left REAL,
      thigh_right REAL, thigh_left REAL,
      calf_right REAL, calf_left REAL
    )
  `);
}
export async function ensureAssessmentSkinsfoldsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS assessment_skinfolds (
      assessment_id INTEGER PRIMARY KEY REFERENCES assessments(id) ON DELETE CASCADE,
      triceps REAL, subscapular REAL, chest REAL, midaxillary REAL,
      suprailiac REAL, abdominal REAL, thigh REAL
    )
  `);
}
export async function ensureAssessmentPhotosTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS assessment_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      angle TEXT CHECK (angle IN ('frente', 'costas', 'lateral_direita', 'lateral_esquerda')),
      url TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
export async function ensureExercisesTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      video_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
export async function ensureWorkoutTemplatesTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
    try {
        await run(`ALTER TABLE workout_templates ADD COLUMN created_by_employee_id INTEGER`);
    }
    catch { /* já existe */ }
}
export async function ensureWorkoutTemplateItemsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS workout_template_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      sets TEXT,
      reps TEXT,
      sort_order INTEGER DEFAULT 0
    )
  `);
}
export async function ensureStudentWorkoutsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS student_workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
      assigned_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
export async function ensureEmployeesTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      role_type TEXT,
      custom_role TEXT,
      cpf TEXT,
      rg TEXT,
      birth_date TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      admission_date TEXT,
      termination_date TEXT,
      employment_type TEXT,
      work_schedule TEXT,
      commission_percent REAL,
      monthly_goal REAL,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'ferias', 'afastado', 'desligado', 'inativo')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
    const empCols = [
        ["role_type", "TEXT"], ["custom_role", "TEXT"], ["cpf", "TEXT"], ["rg", "TEXT"],
        ["birth_date", "TEXT"], ["phone", "TEXT"], ["email", "TEXT"], ["address", "TEXT"],
        ["admission_date", "TEXT"], ["termination_date", "TEXT"],
        ["employment_type", "TEXT"], ["work_schedule", "TEXT"],
    ];
    for (const [col, type] of empCols) {
        try {
            await run(`ALTER TABLE employees ADD COLUMN ${col} ${type}`);
        }
        catch { /* já existe */ }
    }
}
export async function ensureEmployeeAttachmentsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS employee_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type TEXT,
      url TEXT NOT NULL,
      file_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
export async function ensureCheckInsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS check_ins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
      method TEXT NOT NULL DEFAULT 'manual' CHECK (method IN ('manual', 'totem', 'biometria', 'card')),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
    for (const col of [
        "device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL",
        "method TEXT NOT NULL DEFAULT 'manual'"
    ]) {
        try {
            await run(`ALTER TABLE check_ins ADD COLUMN ${col}`);
        }
        catch { /* já existe */ }
    }
}
export async function ensureWorkoutCompletionsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS workout_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      student_workout_id INTEGER NOT NULL REFERENCES student_workouts(id) ON DELETE CASCADE,
      completed_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
export async function ensureStudentAttachmentsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS student_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'atestado',
      content_url TEXT NOT NULL,
      file_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
export async function ensureDevicesTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('totem', 'catraca', 'leitor_digital')),
      location TEXT,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
      last_seen_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
export async function ensureNotificationsTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}
