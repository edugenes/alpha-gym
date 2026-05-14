/**
 * Seed completo com dados realistas para visualização.
 * Uso: npm run db:seed-demo  (usa SQLite em ./data/alpha_gym.db)
 * Cria usuários (se não existir), limpa e preenche: planos, alunos, matrículas,
 * mensalidades, avaliações, exercícios, fichas, funcionários, check-ins, notificações.
 * Login painel (admin): admin / admin
 * Login app: CPF 111.444.777-35 ou ana.silva@email.com / 1234
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { getDb } from "./client.js";
import { ensureUsersTable, ensureStudentsTable, ensurePlansTable, ensureEnrollmentsTable, ensureInstallmentsTable, ensureAssessmentsTable, ensureExercisesTable, ensureWorkoutTemplatesTable, ensureWorkoutTemplateItemsTable, ensureStudentWorkoutsTable, ensureEmployeesTable, ensureCheckInsTable, ensureWorkoutCompletionsTable, ensureNotificationsTable, } from "./schema.js";
function dateStr(d) {
    return d.toISOString().slice(0, 10);
}
function addDays(d, days) {
    const out = new Date(d);
    out.setDate(out.getDate() + days);
    return out;
}
function addMonths(d, months) {
    const out = new Date(d);
    out.setMonth(out.getMonth() + months);
    return out;
}
async function seedDemo() {
    const db = getDb();
    await ensureUsersTable();
    await ensurePlansTable();
    await ensureStudentsTable();
    await ensureEnrollmentsTable();
    await ensureInstallmentsTable();
    await ensureAssessmentsTable();
    await ensureExercisesTable();
    await ensureWorkoutTemplatesTable();
    await ensureWorkoutTemplateItemsTable();
    await ensureStudentWorkoutsTable();
    await ensureEmployeesTable();
    await ensureCheckInsTable();
    await ensureWorkoutCompletionsTable();
    await ensureNotificationsTable();
    await db.query("DELETE FROM users WHERE email IN ('admin', 'admin@alphagym.local', 'recepcao@alphagym.local', 'professor@alphagym.local')");
    const usersToInsert = [
        { email: "admin", name: "Administrador", role: "administrador", password: "admin" },
        { email: "recepcao@alphagym.local", name: "Maria Recepcionista", role: "recepcionista", password: "demo123" },
        { email: "professor@alphagym.local", name: "Carlos Professor", role: "professor", password: "demo123" },
    ];
    for (const u of usersToInsert) {
        const hash = await bcrypt.hash(u.password, 10);
        await db.query("INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)", [u.email.toLowerCase(), hash, u.name, u.role]);
    }
    console.log("Usuários OK (login painel admin: admin / admin)");
    await db.query("DELETE FROM notifications");
    await db.query("DELETE FROM workout_completions");
    await db.query("DELETE FROM check_ins");
    await db.query("DELETE FROM employees");
    await db.query("DELETE FROM student_workouts");
    await db.query("DELETE FROM workout_template_items");
    await db.query("DELETE FROM workout_templates");
    await db.query("DELETE FROM exercises");
    await db.query("DELETE FROM assessments");
    await db.query("DELETE FROM installments");
    await db.query("DELETE FROM enrollments");
    await db.query("DELETE FROM students");
    await db.query("DELETE FROM plans");
    console.log("Tabelas de demo limpas.");
    await db.query(`
    INSERT INTO plans (name, plan_type, price, duration_days, features, is_popular) VALUES
    ('Mensal', 'mensal', 149.90, 30, 'Acesso à academia', 0),
    ('Trimestral', 'trimestral', 399.00, 90, 'Acesso + avaliação', 1),
    ('Semestral', 'semestral', 699.00, 180, 'Acesso + avaliação + 1 personal', 0),
    ('Anual', 'anual', 1199.00, 365, 'Acesso + avaliações + 2 personais', 1)
  `);
    const plans = (await db.query("SELECT id, name, price FROM plans ORDER BY id")).rows;
    console.log("Planos OK:", plans.length);
    const studentHash = await bcrypt.hash("1234", 10);
    const now = new Date();
    const studentsData = [
        { name: "Ana Silva", cpf: "111.444.777-35", email: "ana.silva@email.com", status: "ativo", planName: "Mensal", dueDate: addDays(new Date(), 15), createdMonthsAgo: 4 },
        { name: "Bruno Santos", cpf: "529.982.247-25", email: "bruno.santos@email.com", status: "ativo", planName: "Trimestral", dueDate: addDays(new Date(), 60), createdMonthsAgo: 3 },
        { name: "Carla Oliveira", cpf: "987.654.321-00", email: "carla.oliveira@email.com", status: "ativo", planName: "Anual", dueDate: addMonths(new Date(), 8), createdMonthsAgo: 2 },
        { name: "Diego Costa", cpf: "123.456.789-09", email: "diego.costa@email.com", status: "inadimplente", planName: "Mensal", dueDate: addDays(new Date(), -5), createdMonthsAgo: 3 },
        { name: "Elena Ferreira", cpf: "456.789.123-45", email: "elena@email.com", status: "ativo", planName: "Semestral", dueDate: addMonths(new Date(), 4), createdMonthsAgo: 2 },
        { name: "Fábio Lima", cpf: "789.123.456-12", email: "fabio.lima@email.com", status: "ativo", planName: "Mensal", dueDate: addDays(new Date(), 25), createdMonthsAgo: 1 },
        { name: "Giovana Martins", cpf: "321.654.987-77", email: "giovana@email.com", status: "cancelado", planName: null, dueDate: null, createdMonthsAgo: 5 },
        { name: "Henrique Souza", cpf: "654.987.321-88", email: "henrique@email.com", status: "ativo", planName: "Trimestral", dueDate: addDays(new Date(), 45), createdMonthsAgo: 2 },
        { name: "Isabela Rocha", cpf: "147.258.369-99", email: "isabela.rocha@email.com", status: "ativo", planName: "Mensal", dueDate: addDays(new Date(), 8), createdMonthsAgo: 1 },
        { name: "João Pedro Alves", cpf: "258.369.147-11", email: "joao.alves@email.com", status: "ativo", planName: "Anual", dueDate: addMonths(new Date(), 11), createdMonthsAgo: 0 },
    ];
    for (const s of studentsData) {
        const due = s.dueDate ? dateStr(s.dueDate) : null;
        const createdAt = addMonths(now, -s.createdMonthsAgo);
        await db.query(`INSERT INTO students (name, cpf, email, status, plan_name, due_date, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [s.name, s.cpf, s.email, s.status, s.planName, due, s.status !== "cancelado" ? studentHash : null, createdAt.toISOString()]);
    }
    const students = (await db.query("SELECT id, name, plan_name FROM students ORDER BY id")).rows;
    console.log("Alunos OK:", students.length);
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;
    const planIdByName = {};
    plans.forEach((p) => { planIdByName[p.name] = p.id; });
    for (let i = 0; i < students.length; i++) {
        const s = students[i];
        if (s.plan_name === null)
            continue;
        const planId = planIdByName[s.plan_name];
        if (!planId)
            continue;
        const start = addMonths(now, -2);
        const end = addMonths(start, planId === 1 ? 1 : planId === 2 ? 3 : planId === 3 ? 6 : 12);
        await db.query(`INSERT INTO enrollments (student_id, plan_id, start_date, end_date, active) VALUES ($1, $2, $3, $4, 1)`, [s.id, planId, dateStr(start), dateStr(end)]);
    }
    console.log("Matrículas OK");
    for (let m = -3; m <= 1; m++) {
        let month = thisMonth + m;
        let year = thisYear;
        while (month < 1) {
            month += 12;
            year--;
        }
        while (month > 12) {
            month -= 12;
            year++;
        }
        const dueDate = `${year}-${String(month).padStart(2, "0")}-10`;
        for (const s of students) {
            if (s.plan_name === null)
                continue;
            const planId = planIdByName[s.plan_name];
            if (!planId)
                continue;
            const amount = Number(plans.find((p) => p.id === planId)?.price ?? 149.9);
            const isPaid = m < 0 || (m === 0 && now.getDate() > 15);
            const paidAt = isPaid ? `${year}-${String(month).padStart(2, "0")}-${Math.min(12, now.getDate())} 10:00:00+00` : null;
            const status = isPaid ? "paid" : new Date(dueDate) < new Date() ? "overdue" : "pending";
            await db.query(`INSERT INTO installments (student_id, plan_id, due_date, amount, status, paid_at) VALUES ($1, $2, $3, $4, $5, $6)`, [s.id, planId, dueDate, amount, status, paidAt]);
        }
    }
    console.log("Mensalidades OK");
    const assessmentDates = [dateStr(addDays(now, -90)), dateStr(addDays(now, -60)), dateStr(addDays(now, -30)), dateStr(now)];
    for (let i = 0; i < Math.min(6, students.length); i++) {
        const studentId = students[i].id;
        let weight = 72 - i * 2;
        const height = 1.72;
        for (let j = 0; j < 3; j++) {
            weight += Math.random() * 2 - 0.5;
            const imc = Math.round((weight / (height * height)) * 100) / 100;
            const fat = 22 + j * 0.5 - (i % 2);
            const lean = Math.round((weight * (1 - fat / 100)) * 100) / 100;
            await db.query(`INSERT INTO assessments (student_id, assessment_date, weight, height, imc, fat_percent, lean_mass, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [studentId, assessmentDates[j], weight.toFixed(2), height, imc, fat.toFixed(2), lean, j === 2 ? "Evolução positiva" : null]);
        }
    }
    console.log("Avaliações OK");
    const exercisesData = [
        { name: "Supino reto", muscle_group: "Peito" },
        { name: "Supino inclinado", muscle_group: "Peito" },
        { name: "Crucifixo", muscle_group: "Peito" },
        { name: "Desenvolvimento", muscle_group: "Ombros" },
        { name: "Elevação lateral", muscle_group: "Ombros" },
        { name: "Remada curvada", muscle_group: "Costas" },
        { name: "Puxada frontal", muscle_group: "Costas" },
        { name: "Rosca direta", muscle_group: "Bíceps" },
        { name: "Tríceps pulley", muscle_group: "Tríceps" },
        { name: "Agachamento livre", muscle_group: "Pernas" },
        { name: "Leg press", muscle_group: "Pernas" },
        { name: "Cadeira extensora", muscle_group: "Pernas" },
        { name: "Stiff", muscle_group: "Posterior" },
        { name: "Abdominal crunch", muscle_group: "Abdômen" },
    ];
    for (const e of exercisesData) {
        await db.query(`INSERT INTO exercises (name, muscle_group) VALUES ($1, $2)`, [e.name, e.muscle_group]);
    }
    const exercises = (await db.query("SELECT id, name, muscle_group FROM exercises ORDER BY id")).rows;
    console.log("Exercícios OK:", exercises.length);
    await db.query(`INSERT INTO workout_templates (name) VALUES ('Ficha A - Peito e Tríceps'), ('Ficha B - Costas e Bíceps'), ('Ficha C - Pernas e Ombros')`);
    const templates = (await db.query("SELECT id, name FROM workout_templates ORDER BY id")).rows;
    const ex = (i) => exercises[i].id;
    const templateItems = [
        { templateIndex: 0, exerciseIndexes: [0, 1, 2, 8], sets: ["3", "3", "3", "3"], reps: ["12", "10", "10", "12"] },
        { templateIndex: 1, exerciseIndexes: [5, 6, 7], sets: ["3", "3", "3"], reps: ["12", "10", "12"] },
        { templateIndex: 2, exerciseIndexes: [9, 10, 3, 4, 12], sets: ["4", "3", "3", "3", "3"], reps: ["10", "12", "10", "12", "15"] },
    ];
    for (const row of templateItems) {
        const templateId = templates[row.templateIndex].id;
        for (let idx = 0; idx < row.exerciseIndexes.length; idx++) {
            const exerciseId = ex(row.exerciseIndexes[idx]);
            await db.query(`INSERT INTO workout_template_items (template_id, exercise_id, sets, reps, sort_order) VALUES ($1, $2, $3, $4, $5)`, [templateId, exerciseId, row.sets[idx], row.reps[idx], idx]);
        }
    }
    console.log("Fichas e itens OK");
    for (let i = 0; i < Math.min(7, students.length); i++) {
        if (students[i].plan_name === null)
            continue;
        const templateId = templates[i % 3].id;
        const ins = await db.query(`INSERT INTO student_workouts (student_id, template_id) VALUES ($1, $2) RETURNING id`, [students[i].id, templateId]);
        const swId = ins.rows[0].id;
        if (i % 2 === 0) {
            await db.query(`INSERT INTO workout_completions (student_id, student_workout_id) VALUES ($1, $2)`, [students[i].id, swId]);
        }
    }
    console.log("Vínculos aluno-ficha e conclusões OK");
    await db.query(`
    INSERT INTO employees (name, role, commission_percent, monthly_goal, status) VALUES
    ('Ricardo Personal', 'Personal Trainer', 10, 8000, 'ativo'),
    ('Fernanda Recepção', 'Recepcionista', 5, 3000, 'ativo'),
    ('Marcos Coordenador', 'Coordenador', 8, 15000, 'ativo')
  `);
    console.log("Funcionários OK");
    const studentIds = students.filter((s) => s.plan_name !== null).map((s) => s.id);
    for (let d = 0; d < 30; d++) {
        const day = new Date(now);
        day.setDate(day.getDate() - d);
        const baseHour = 6 + Math.floor(Math.random() * 12);
        const count = 3 + Math.floor(Math.random() * 8);
        for (let c = 0; c < count; c++) {
            const studentId = studentIds[Math.floor(Math.random() * studentIds.length)];
            const hour = Math.min(21, baseHour + Math.floor(Math.random() * 3));
            const createdAt = new Date(day);
            createdAt.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
            await db.query(`INSERT INTO check_ins (student_id, created_at) VALUES ($1, $2)`, [studentId, createdAt.toISOString()]);
        }
    }
    console.log("Check-ins OK (últimos 30 dias)");
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    await db.query(`INSERT INTO notifications (student_id, title, body, read_at, created_at) VALUES ($1, 'Lembrete de vencimento', 'Sua mensalidade vence em 10 dias. Evite atrasos!', NULL, $2), ($3, 'Novo treino disponível', 'Sua ficha B foi atualizada. Confira no app.', $4, $5), ($6, 'Promoção Anual', 'Renove no plano anual e ganhe 1 mês. Válido até o fim do mês.', NULL, $7)`, [students[0].id, twoDaysAgo.toISOString(), students[1].id, oneDayAgo.toISOString(), threeDaysAgo.toISOString(), students[2].id, fiveDaysAgo.toISOString()]);
    console.log("Notificações OK");
    console.log("\n--- Seed demo concluído. ---");
    console.log("Login painel (admin): admin / admin");
    console.log("Login app (aluno): CPF 111.444.777-35 ou ana.silva@email.com / 1234");
    process.exit(0);
}
seedDemo().catch((e) => {
    console.error(e);
    process.exit(1);
});
