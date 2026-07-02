import { Router } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "../db/client.js";
import { ensureEmployeesTable, ensureEmployeeAttachmentsTable, ensureUsersTable, ensureEnrollmentsTable, ensurePlansTable, } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
export const employeesRouter = Router();
employeesRouter.use(requireAuth);
const onlyAdmin = requireRole("administrador");
function rowToEmployee(r, includePrivate = false) {
    const base = {
        id: r.id,
        name: r.name,
        role: r.role,
        roleType: r.role_type,
        customRole: r.custom_role,
        phone: r.phone,
        email: r.email,
        admissionDate: r.admission_date,
        terminationDate: r.termination_date,
        employmentType: r.employment_type,
        workSchedule: r.work_schedule,
        commissionPercent: r.commission_percent,
        monthlyGoal: r.monthly_goal,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
    if (!includePrivate)
        return base;
    return { ...base, cpf: r.cpf, rg: r.rg, birthDate: r.birth_date, address: r.address };
}
// ── GET /api/employees ────────────────────────────────────────────────────────
employeesRouter.get("/", async (req, res) => {
    try {
        await ensureEmployeesTable();
        const db = getDb();
        const { status, role_type } = req.query;
        let sql = "SELECT * FROM employees WHERE 1=1";
        const params = [];
        if (status) {
            sql += ` AND status = $${params.length + 1}`;
            params.push(status);
        }
        if (role_type) {
            sql += ` AND role_type = $${params.length + 1}`;
            params.push(role_type);
        }
        sql += " ORDER BY name";
        const result = await db.query(sql, params);
        const isAdmin = req.user?.role === "administrador";
        res.json({ employees: result.rows.map((r) => rowToEmployee(r, isAdmin)) });
    }
    catch (e) {
        console.error("Employees list error:", e);
        res.status(500).json({ error: "Erro ao listar funcionários." });
    }
});
// ── GET /api/employees/:id ─────────────────────────────────────────────────────
employeesRouter.get("/:id(\\d+)", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await ensureEmployeesTable();
        const db = getDb();
        const result = await db.query("SELECT * FROM employees WHERE id = $1", [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Funcionário não encontrado." });
        const isAdmin = req.user?.role === "administrador";
        res.json({ employee: rowToEmployee(result.rows[0], isAdmin) });
    }
    catch (e) {
        console.error("Employee get error:", e);
        res.status(500).json({ error: "Erro ao buscar funcionário." });
    }
});
// ── GET /api/employees/:id/performance ────────────────────────────────────────
employeesRouter.get("/:id/performance", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const month = req.query.month ?? new Date().toISOString().slice(0, 7); // YYYY-MM
        await ensureEmployeesTable();
        await ensureEnrollmentsTable();
        await ensurePlansTable();
        const db = getDb();
        const empRes = await db.query("SELECT commission_percent, monthly_goal FROM employees WHERE id = $1", [id]);
        if (empRes.rows.length === 0)
            return res.status(404).json({ error: "Funcionário não encontrado." });
        const emp = empRes.rows[0];
        // Matrículas fechadas pelo funcionário naquele mês (valor do plano × duração proporcional ou valor mensal)
        const salesRes = await db.query(`SELECT COALESCE(SUM(p.price), 0) as total_sales, COUNT(e.id) as count
       FROM enrollments e
       JOIN plans p ON p.id = e.plan_id
       WHERE e.employee_id = $1
         AND strftime('%Y-%m', e.created_at) = $2`, [id, month]);
        const sales = salesRes.rows[0];
        const totalSales = Number(sales.total_sales);
        const commission = emp.commission_percent != null ? Math.round(totalSales * (emp.commission_percent / 100) * 100) / 100 : null;
        const goalPercent = emp.monthly_goal != null && emp.monthly_goal > 0
            ? Math.round((totalSales / emp.monthly_goal) * 100 * 10) / 10
            : null;
        res.json({
            employeeId: id, month,
            totalSales, salesCount: Number(sales.count),
            commissionPercent: emp.commission_percent, commission,
            monthlyGoal: emp.monthly_goal, goalPercent,
        });
    }
    catch (e) {
        console.error("Performance error:", e);
        res.status(500).json({ error: "Erro ao calcular desempenho." });
    }
});
// ── POST /api/employees ────────────────────────────────────────────────────────
employeesRouter.post("/", onlyAdmin, async (req, res) => {
    try {
        const body = req.body;
        if (!body.name?.trim() || !body.role?.trim()) {
            return res.status(400).json({ error: "Nome e cargo são obrigatórios." });
        }
        await ensureEmployeesTable();
        await ensureUsersTable();
        const db = getDb();
        const validStatuses = ["ativo", "ferias", "afastado", "desligado"];
        const status = validStatuses.includes(body.status ?? "") ? body.status : "ativo";
        const insert = await db.query(`INSERT INTO employees
        (name, role, role_type, custom_role, cpf, rg, birth_date, phone, email, address,
         admission_date, termination_date, employment_type, work_schedule,
         commission_percent, monthly_goal, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`, [
            body.name.trim(), body.role.trim(),
            body.roleType ?? null, body.customRole ?? null,
            body.cpf ?? null, body.rg ?? null, body.birthDate ?? null,
            body.phone ?? null, body.email ?? null, body.address ?? null,
            body.admissionDate ?? null, body.terminationDate ?? null,
            body.employmentType ?? null, body.workSchedule ?? null,
            body.commissionPercent ?? null, body.monthlyGoal ?? null,
            status,
        ]);
        const newEmp = insert.rows[0];
        let tempPassword = null;
        let loginCreated = false;
        if (body.createLogin && body.loginEmail?.trim() && body.loginRole) {
            const validRoles = ["administrador", "recepcionista", "professor"];
            if (!validRoles.includes(body.loginRole)) {
                return res.status(400).json({ error: "Papel de acesso inválido." });
            }
            tempPassword = randomBytes(4).toString("hex"); // ex: "a3f1b2c4"
            const hash = await bcrypt.hash(tempPassword, 10);
            try {
                await db.query(`INSERT INTO users (email, password_hash, name, role, employee_id, active)
           VALUES ($1,$2,$3,$4,$5,1)`, [body.loginEmail.trim().toLowerCase(), hash, newEmp.name, body.loginRole, newEmp.id]);
                loginCreated = true;
            }
            catch {
                // e-mail já existe — não impede salvar o funcionário
            }
        }
        res.status(201).json({
            employee: rowToEmployee(newEmp, true),
            loginCreated,
            tempPassword,
        });
    }
    catch (e) {
        console.error("Employee create error:", e);
        res.status(500).json({ error: "Erro ao cadastrar funcionário." });
    }
});
// ── PUT /api/employees/:id ─────────────────────────────────────────────────────
employeesRouter.put("/:id(\\d+)", onlyAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const body = req.body;
        await ensureEmployeesTable();
        await ensureUsersTable();
        const db = getDb();
        const existing = await db.query("SELECT * FROM employees WHERE id = $1", [id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ error: "Funcionário não encontrado." });
        const row = existing.rows[0];
        const validStatuses = ["ativo", "ferias", "afastado", "desligado", "inativo"];
        const newStatus = body.status !== undefined && validStatuses.includes(body.status) ? body.status : row.status;
        await db.query(`UPDATE employees SET
        name=$1, role=$2, role_type=$3, custom_role=$4, cpf=$5, rg=$6, birth_date=$7,
        phone=$8, email=$9, address=$10, admission_date=$11, termination_date=$12,
        employment_type=$13, work_schedule=$14, commission_percent=$15, monthly_goal=$16,
        status=$17, updated_at=datetime('now')
       WHERE id=$18`, [
            body.name?.trim() ?? row.name,
            body.role?.trim() ?? row.role,
            body.roleType ?? row.role_type,
            body.customRole ?? row.custom_role,
            body.cpf ?? row.cpf,
            body.rg ?? row.rg,
            body.birthDate ?? row.birth_date,
            body.phone ?? row.phone,
            body.email ?? row.email,
            body.address ?? row.address,
            body.admissionDate ?? row.admission_date,
            body.terminationDate ?? row.termination_date,
            body.employmentType ?? row.employment_type,
            body.workSchedule ?? row.work_schedule,
            body.commissionPercent !== undefined ? body.commissionPercent : row.commission_percent,
            body.monthlyGoal !== undefined ? body.monthlyGoal : row.monthly_goal,
            newStatus,
            id,
        ]);
        // Se status → desligado, bloquear login vinculado
        if (newStatus === "desligado") {
            await db.query("UPDATE users SET active = 0 WHERE employee_id = $1", [id]);
        }
        let tempPassword = null;
        let loginCreated = false;
        if (body.createLogin && body.loginEmail?.trim() && body.loginRole) {
            const validRoles = ["administrador", "recepcionista", "professor"];
            if (validRoles.includes(body.loginRole)) {
                const existingUser = await db.query("SELECT id FROM users WHERE employee_id = $1", [id]);
                if (existingUser.rows.length === 0) {
                    tempPassword = randomBytes(4).toString("hex");
                    const hash = await bcrypt.hash(tempPassword, 10);
                    try {
                        await db.query(`INSERT INTO users (email, password_hash, name, role, employee_id, active)
               VALUES ($1,$2,$3,$4,$5,1)`, [body.loginEmail.trim().toLowerCase(), hash, body.name?.trim() ?? row.name, body.loginRole, id]);
                        loginCreated = true;
                    }
                    catch { /* e-mail já existe */ }
                }
            }
        }
        const updated = await db.query("SELECT * FROM employees WHERE id = $1", [id]);
        res.json({
            employee: rowToEmployee(updated.rows[0], true),
            loginCreated,
            tempPassword,
        });
    }
    catch (e) {
        console.error("Employee update error:", e);
        res.status(500).json({ error: "Erro ao atualizar funcionário." });
    }
});
// ── DELETE /api/employees/:id ──────────────────────────────────────────────────
employeesRouter.delete("/:id(\\d+)", onlyAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
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
// ── Anexos ────────────────────────────────────────────────────────────────────
employeesRouter.get("/:id/attachments", onlyAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await ensureEmployeeAttachmentsTable();
        const db = getDb();
        const result = await db.query("SELECT * FROM employee_attachments WHERE employee_id = $1 ORDER BY created_at DESC", [id]);
        res.json({
            attachments: result.rows.map((r) => ({
                id: r.id, employeeId: r.employee_id, type: r.type, url: r.url, fileName: r.file_name, createdAt: r.created_at,
            }))
        });
    }
    catch (e) {
        console.error("Attachments list error:", e);
        res.status(500).json({ error: "Erro ao listar anexos." });
    }
});
employeesRouter.post("/:id/attachments", onlyAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { type, url, fileName } = req.body;
        if (!url?.trim())
            return res.status(400).json({ error: "URL/conteúdo do anexo é obrigatório." });
        await ensureEmployeeAttachmentsTable();
        const db = getDb();
        const exists = await db.query("SELECT id FROM employees WHERE id = $1", [id]);
        if (exists.rows.length === 0)
            return res.status(404).json({ error: "Funcionário não encontrado." });
        const insert = await db.query("INSERT INTO employee_attachments (employee_id, type, url, file_name) VALUES ($1,$2,$3,$4) RETURNING *", [id, type ?? null, url.trim(), fileName ?? null]);
        const r = insert.rows[0];
        res.status(201).json({
            attachment: { id: r.id, employeeId: r.employee_id, type: r.type, url: r.url, fileName: r.file_name, createdAt: r.created_at }
        });
    }
    catch (e) {
        console.error("Attachment create error:", e);
        res.status(500).json({ error: "Erro ao salvar anexo." });
    }
});
employeesRouter.delete("/attachments/:attachId", onlyAdmin, async (req, res) => {
    try {
        const attachId = parseInt(req.params.attachId, 10);
        await ensureEmployeeAttachmentsTable();
        const db = getDb();
        const result = await db.query("DELETE FROM employee_attachments WHERE id = $1 RETURNING id", [attachId]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Anexo não encontrado." });
        res.status(204).send();
    }
    catch (e) {
        console.error("Attachment delete error:", e);
        res.status(500).json({ error: "Erro ao remover anexo." });
    }
});
