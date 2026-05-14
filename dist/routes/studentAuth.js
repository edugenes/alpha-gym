import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "../db/client.js";
import { ensureStudentsTable, ensureInstallmentsTable, ensureCheckInsTable } from "../db/schema.js";
import { requireStudentAuth } from "../middleware/auth.js";
export const studentAuthRouter = Router();
const JWT_SECRET = (process.env.JWT_SECRET ?? "dev-secret-change-in-production");
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "30d";
const studentSignOpts = { expiresIn: JWT_EXPIRES_IN };
function normalizeCpfOrEmail(input) {
    const trimmed = input.trim();
    if (trimmed.includes("@"))
        return trimmed.toLowerCase();
    return trimmed.replace(/\D/g, "");
}
/** POST /api/student-auth/login — Login do aluno (CPF ou email + senha) */
studentAuthRouter.post("/login", async (req, res) => {
    try {
        const { cpfOrEmail, password } = req.body;
        if (!cpfOrEmail || !password) {
            res.status(400).json({ error: "CPF/email e senha são obrigatórios." });
            return;
        }
        await ensureStudentsTable();
        const db = getDb();
        const normalized = normalizeCpfOrEmail(cpfOrEmail);
        const isEmail = normalized.includes("@");
        const row = await db.query(isEmail
            ? "SELECT id, name, cpf, email, status, plan_name, due_date, password_hash FROM students WHERE LOWER(TRIM(email)) = $1"
            : "SELECT id, name, cpf, email, status, plan_name, due_date, password_hash FROM students WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = $1", [normalized]);
        if (row.rows.length === 0) {
            res.status(401).json({ error: "Credenciais inválidas." });
            return;
        }
        const student = row.rows[0];
        if (!student.password_hash) {
            res.status(403).json({ error: "Senha do app não definida. Peça na recepção para ativar seu acesso." });
            return;
        }
        const valid = await bcrypt.compare(password, student.password_hash);
        if (!valid) {
            res.status(401).json({ error: "Credenciais inválidas." });
            return;
        }
        if (student.status === "cancelado") {
            res.status(403).json({ error: "Sua matrícula está cancelada." });
            return;
        }
        const token = jwt.sign({ sub: student.id, type: "student" }, JWT_SECRET, studentSignOpts);
        res.json({
            token,
            student: {
                id: student.id,
                name: student.name,
                cpf: student.cpf,
                email: student.email,
                status: student.status,
                planName: student.plan_name,
                dueDate: student.due_date,
            },
        });
    }
    catch (e) {
        console.error("Student login error:", e);
        res.status(500).json({ error: "Erro ao realizar login." });
    }
});
/** GET /api/student-auth/me — Dados do aluno logado (resumo para tela inicial) */
studentAuthRouter.get("/me", requireStudentAuth, async (req, res) => {
    try {
        const studentId = req.studentId;
        await ensureInstallmentsTable();
        await ensureCheckInsTable();
        const db = getDb();
        const student = await db.query(`SELECT id, name, cpf, email, status, plan_name, due_date FROM students WHERE id = $1`, [studentId]);
        if (student.rows.length === 0) {
            res.status(404).json({ error: "Aluno não encontrado." });
            return;
        }
        const s = student.rows[0];
        const dueDate = s.due_date;
        let nextPayment = null;
        const nextInst = await db.query(`SELECT due_date, amount FROM installments WHERE student_id = $1 AND status = 'pending' AND date(due_date) >= date('now') ORDER BY due_date LIMIT 1`, [studentId]);
        if (nextInst.rows.length > 0) {
            const r = nextInst.rows[0];
            nextPayment = { dueDate: r.due_date, amount: Number(r.amount) };
        }
        const freq = await db.query(`SELECT COUNT(*) as count FROM check_ins WHERE student_id = $1 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`, [studentId]);
        const frequencyThisMonth = Number(freq.rows[0].count);
        res.json({
            student: {
                id: s.id,
                name: s.name,
                status: s.status,
                planName: s.plan_name,
                dueDate: s.due_date,
            },
            nextPayment,
            frequencyThisMonth,
        });
    }
    catch (e) {
        console.error("Student me error:", e);
        res.status(500).json({ error: "Erro ao buscar dados." });
    }
});
/** POST /api/student-auth/forgot-password — Recuperação de senha (stub) */
studentAuthRouter.post("/forgot-password", async (req, res) => {
    const { cpfOrEmail } = req.body;
    if (!cpfOrEmail?.trim()) {
        res.status(400).json({ error: "Informe CPF ou email." });
        return;
    }
    res.json({ message: "Em breve você receberá instruções por email. Entre em contato com a recepção se precisar de ajuda." });
});
/** POST /api/student-auth/reset-password — Redefinir senha com token (stub) */
studentAuthRouter.post("/reset-password", async (req, res) => {
    res.status(501).json({ error: "Recuperação de senha em breve. Entre em contato com a recepção." });
});
