import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensureEmployeesTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
export const employeesRouter = Router();
employeesRouter.use(requireAuth);
function rowToEmployee(r) {
    return {
        id: r.id,
        name: r.name,
        role: r.role,
        commissionPercent: r.commission_percent != null ? Number(r.commission_percent) : null,
        monthlyGoal: r.monthly_goal != null ? Number(r.monthly_goal) : null,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
employeesRouter.get("/", async (_req, res) => {
    try {
        await ensureEmployeesTable();
        const db = getDb();
        const result = await db.query("SELECT * FROM employees ORDER BY name");
        res.json({ employees: result.rows.map((r) => rowToEmployee(r)) });
    }
    catch (e) {
        console.error("Employees list error:", e);
        res.status(500).json({ error: "Erro ao listar funcionários." });
    }
});
employeesRouter.get("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        await ensureEmployeesTable();
        const db = getDb();
        const result = await db.query("SELECT * FROM employees WHERE id = $1", [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Funcionário não encontrado." });
        res.json({ employee: rowToEmployee(result.rows[0]) });
    }
    catch (e) {
        console.error("Employee get error:", e);
        res.status(500).json({ error: "Erro ao buscar funcionário." });
    }
});
employeesRouter.post("/", async (req, res) => {
    try {
        const body = req.body;
        if (!body.name?.trim() || !body.role?.trim()) {
            return res.status(400).json({ error: "Nome e cargo são obrigatórios." });
        }
        await ensureEmployeesTable();
        const db = getDb();
        const status = body.status === "inativo" ? "inativo" : "ativo";
        const insert = await db.query(`INSERT INTO employees (name, role, commission_percent, monthly_goal, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [body.name.trim(), body.role.trim(), body.commissionPercent ?? null, body.monthlyGoal ?? null, status]);
        res.status(201).json({ employee: rowToEmployee(insert.rows[0]) });
    }
    catch (e) {
        console.error("Employee create error:", e);
        res.status(500).json({ error: "Erro ao cadastrar funcionário." });
    }
});
employeesRouter.put("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        const body = req.body;
        await ensureEmployeesTable();
        const db = getDb();
        const existing = await db.query("SELECT * FROM employees WHERE id = $1", [id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ error: "Funcionário não encontrado." });
        const row = existing.rows[0];
        const status = body.status !== undefined ? (body.status === "inativo" ? "inativo" : "ativo") : row.status;
        await db.query(`UPDATE employees SET name = COALESCE($1, name), role = COALESCE($2, role), commission_percent = $3, monthly_goal = $4, status = $5, updated_at = datetime('now') WHERE id = $6`, [
            body.name?.trim() ?? row.name,
            body.role?.trim() ?? row.role,
            body.commissionPercent !== undefined ? body.commissionPercent : row.commission_percent,
            body.monthlyGoal !== undefined ? body.monthlyGoal : row.monthly_goal,
            status,
            id,
        ]);
        const updated = await db.query("SELECT * FROM employees WHERE id = $1", [id]);
        res.json({ employee: rowToEmployee(updated.rows[0]) });
    }
    catch (e) {
        console.error("Employee update error:", e);
        res.status(500).json({ error: "Erro ao atualizar funcionário." });
    }
});
employeesRouter.delete("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        await ensureEmployeesTable();
        const db = getDb();
        const result = await db.query("DELETE FROM employees WHERE id = $1 RETURNING id", [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Funcionário não encontrado." });
        res.status(204).send();
    }
    catch (e) {
        console.error("Employee delete error:", e);
        res.status(500).json({ error: "Erro ao excluir funcionário." });
    }
});
