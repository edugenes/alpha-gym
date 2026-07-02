import { getDb } from "./client.js";

function run(sql: string, params?: unknown[]): Promise<void> {
  const db = getDb();
  return db.query(sql, params || []).then(() => {});
}

export async function ensureUsersTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('administrador', 'recepcionista', 'professor')),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

export async function ensureStudentsTable(): Promise<void> {
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
  for (const col of ["password_hash", "biometric_device_ref"]) {
    try { await run(`ALTER TABLE students ADD COLUMN ${col} TEXT`); } catch { /* já existe */ }
  }
}


export async function ensurePlansTable(): Promise<void> {
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

export async function ensureEnrollmentsTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

export async function ensureInstallmentsTable(): Promise<void> {
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

export async function ensureAssessmentsTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      assessment_date TEXT NOT NULL,
      weight REAL NOT NULL CHECK (weight >= 0),
      height REAL NOT NULL CHECK (height >= 0),
      imc REAL,
      fat_percent REAL,
      lean_mass REAL,
      measures TEXT,
      photo_before_url TEXT,
      photo_after_url TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

export async function ensureExercisesTable(): Promise<void> {
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

export async function ensureWorkoutTemplatesTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

export async function ensureWorkoutTemplateItemsTable(): Promise<void> {
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

export async function ensureStudentWorkoutsTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS student_workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
      assigned_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

export async function ensureEmployeesTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      commission_percent REAL,
      monthly_goal REAL,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

export async function ensureCheckInsTable(): Promise<void> {
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
    try { await run(`ALTER TABLE check_ins ADD COLUMN ${col}`); } catch { /* já existe */ }
  }
}

export async function ensureWorkoutCompletionsTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS workout_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      student_workout_id INTEGER NOT NULL REFERENCES student_workouts(id) ON DELETE CASCADE,
      completed_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

export async function ensureStudentAttachmentsTable(): Promise<void> {
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

export async function ensureDevicesTable(): Promise<void> {
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

export async function ensureNotificationsTable(): Promise<void> {
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
