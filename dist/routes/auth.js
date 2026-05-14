import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "../db/client.js";
import { ensureUsersTable } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
export const authRouter = Router();
const JWT_SECRET = (process.env.JWT_SECRET ?? "dev-secret-change-in-production");
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
const signOpts = { expiresIn: JWT_EXPIRES_IN };
/** POST /api/auth/login — Login seguro (email + senha) */
authRouter.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: "Email e senha são obrigatórios." });
            return;
        }
        await ensureUsersTable();
        const db = getDb();
        const row = await db.query("SELECT id, email, name, role, password_hash FROM users WHERE email = $1", [email.trim().toLowerCase()]);
        if (row.rows.length === 0) {
            res.status(401).json({ error: "Credenciais inválidas." });
            return;
        }
        const user = row.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            res.status(401).json({ error: "Credenciais inválidas." });
            return;
        }
        const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, signOpts);
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });
    }
    catch (e) {
        console.error("Login error:", e);
        const msg = process.env.NODE_ENV === "development" && e instanceof Error ? e.message : "Erro ao realizar login.";
        res.status(500).json({ error: msg });
    }
});
/** GET /api/auth/me — Retorna usuário atual (token obrigatório) */
authRouter.get("/me", requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const row = await db.query("SELECT id, email, name, role FROM users WHERE id = $1", [req.auth.sub]);
        if (row.rows.length === 0) {
            res.status(404).json({ error: "Usuário não encontrado." });
            return;
        }
        const user = row.rows[0];
        res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    }
    catch (e) {
        console.error("Me error:", e);
        res.status(500).json({ error: "Erro ao buscar usuário." });
    }
});
/** GET /api/auth/users — Listar usuários (apenas administrador) */
authRouter.get("/users", requireAuth, requireRole("administrador"), async (req, res) => {
    try {
        await ensureUsersTable();
        const db = getDb();
        const result = await db.query("SELECT id, email, name, role, created_at FROM users ORDER BY name");
        const users = result.rows.map((r) => ({
            id: r.id,
            email: r.email,
            name: r.name,
            role: r.role,
            createdAt: r.created_at,
        }));
        res.json({ users });
    }
    catch (e) {
        console.error("Users list error:", e);
        res.status(500).json({ error: "Erro ao listar usuários." });
    }
});
/** POST /api/auth/register — Cadastro de usuário interno (apenas administrador) */
authRouter.post("/register", requireAuth, requireRole("administrador"), async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        if (!email || !password || !name || !role) {
            res.status(400).json({ error: "Email, senha, nome e perfil são obrigatórios." });
            return;
        }
        const allowedRoles = ["administrador", "recepcionista", "professor"];
        if (!allowedRoles.includes(role)) {
            res.status(400).json({ error: "Perfil inválido. Use: administrador, recepcionista ou professor." });
            return;
        }
        await ensureUsersTable();
        const db = getDb();
        const existing = await db.query("SELECT id FROM users WHERE email = $1", [email.trim().toLowerCase()]);
        if (existing.rows.length > 0) {
            res.status(409).json({ error: "Este email já está cadastrado." });
            return;
        }
        const password_hash = await bcrypt.hash(password, 10);
        const insert = await db.query("INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role", [email.trim().toLowerCase(), password_hash, name.trim(), role]);
        const user = insert.rows[0];
        res.status(201).json({
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
    }
    catch (e) {
        console.error("Register error:", e);
        res.status(500).json({ error: "Erro ao cadastrar usuário." });
    }
});
