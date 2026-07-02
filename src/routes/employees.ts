import { Router } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "../db/client.js";
import {
  ensureEmployeesTable,
  ensureEmployeeAttachmentsTable,
  ensurePayrollTable,
  ensureUsersTable,
  ensureEnrollmentsTable,
  ensurePlansTable,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const employeesRouter = Router();
employeesRouter.use(requireAuth);

const onlyAdmin = requireRole("administrador");

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: number; name: string; role: string;
  role_type: string | null; custom_role: string | null;
  cpf: string | null; rg: string | null; birth_date: string | null;
  phone: string | null; email: string | null; address: string | null;
  admission_date: string | null; termination_date: string | null;
  employment_type: string | null; work_schedule: string | null;
  salary: number | null;
  commission_percent: number | null; monthly_goal: number | null;
  status: string; created_at: string; updated_at: string;
}

interface PayrollRow {
  id: number; employee_id: number; reference_month: string;
  base_salary: number; commission: number; bonus: number;
  deductions: number; total: number; status: string;
  paid_at: string | null; notes: string | null; created_at: string;
}

interface AttachRow { id: number; employee_id: number; type: string | null; url: string; file_name: string | null; created_at: string }

function rowToEmployee(r: EmployeeRow, includePrivate = false) {
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
    salary: r.salary,
    commissionPercent: r.commission_percent,
    monthlyGoal: r.monthly_goal,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (!includePrivate) return base;
  return { ...base, cpf: r.cpf, rg: r.rg, birthDate: r.birth_date, address: r.address };
}

function rowToPayroll(r: PayrollRow) {
  return {
    id: r.id, employeeId: r.employee_id, referenceMonth: r.reference_month,
    baseSalary: r.base_salary, commission: r.commission, bonus: r.bonus,
    deductions: r.deductions, total: r.total, status: r.status,
    paidAt: r.paid_at, notes: r.notes, createdAt: r.created_at,
  };
}

// ── GET /api/employees ────────────────────────────────────────────────────────

employeesRouter.get("/", async (req, res) => {
  try {
    await ensureEmployeesTable();
    const db = getDb();
    const { status, role_type } = req.query as { status?: string; role_type?: string };
    let sql = "SELECT * FROM employees WHERE 1=1";
    const params: unknown[] = [];
    if (status) { sql += ` AND status = $${params.length + 1}`; params.push(status); }
    if (role_type) { sql += ` AND role_type = $${params.length + 1}`; params.push(role_type); }
    sql += " ORDER BY name";
    const result = await db.query(sql, params);
    const isAdmin = (req as typeof req & { user?: { role?: string } }).user?.role === "administrador";
    res.json({ employees: (result.rows as EmployeeRow[]).map((r) => rowToEmployee(r, isAdmin)) });
  } catch (e) {
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
    if (result.rows.length === 0) return res.status(404).json({ error: "Funcionário não encontrado." });
    const isAdmin = (req as typeof req & { user?: { role?: string } }).user?.role === "administrador";
    res.json({ employee: rowToEmployee(result.rows[0] as EmployeeRow, isAdmin) });
  } catch (e) {
    console.error("Employee get error:", e);
    res.status(500).json({ error: "Erro ao buscar funcionário." });
  }
});

// ── GET /api/employees/:id/performance ────────────────────────────────────────

employeesRouter.get("/:id/performance", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7); // YYYY-MM
    await ensureEmployeesTable();
    await ensureEnrollmentsTable();
    await ensurePlansTable();
    const db = getDb();

    const empRes = await db.query("SELECT commission_percent, monthly_goal FROM employees WHERE id = $1", [id]);
    if (empRes.rows.length === 0) return res.status(404).json({ error: "Funcionário não encontrado." });
    const emp = empRes.rows[0] as { commission_percent: number | null; monthly_goal: number | null };

    // Matrículas fechadas pelo funcionário naquele mês (valor do plano × duração proporcional ou valor mensal)
    const salesRes = await db.query(
      `SELECT COALESCE(SUM(p.price), 0) as total_sales, COUNT(e.id) as count
       FROM enrollments e
       JOIN plans p ON p.id = e.plan_id
       WHERE e.employee_id = $1
         AND strftime('%Y-%m', e.created_at) = $2`,
      [id, month]
    );
    const sales = salesRes.rows[0] as { total_sales: number; count: number };
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
  } catch (e) {
    console.error("Performance error:", e);
    res.status(500).json({ error: "Erro ao calcular desempenho." });
  }
});

// ── POST /api/employees ────────────────────────────────────────────────────────

employeesRouter.post("/", onlyAdmin, async (req, res) => {
  try {
    const body = req.body as {
      name: string; role: string; roleType?: string; customRole?: string;
      cpf?: string; rg?: string; birthDate?: string; phone?: string; email?: string; address?: string;
      admissionDate?: string; terminationDate?: string; employmentType?: string; workSchedule?: string;
      salary?: number; commissionPercent?: number; monthlyGoal?: number; status?: string;
      createLogin?: boolean; loginEmail?: string; loginRole?: string;
    };

    if (!body.name?.trim() || !body.role?.trim()) {
      return res.status(400).json({ error: "Nome e cargo são obrigatórios." });
    }

    await ensureEmployeesTable();
    await ensureUsersTable();
    const db = getDb();

    const validStatuses = ["ativo", "ferias", "afastado", "desligado"];
    const status = validStatuses.includes(body.status ?? "") ? body.status! : "ativo";

    const insert = await db.query(
      `INSERT INTO employees
        (name, role, role_type, custom_role, cpf, rg, birth_date, phone, email, address,
         admission_date, termination_date, employment_type, work_schedule,
         salary, commission_percent, monthly_goal, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        body.name.trim(), body.role.trim(),
        body.roleType ?? null, body.customRole ?? null,
        body.cpf ?? null, body.rg ?? null, body.birthDate ?? null,
        body.phone ?? null, body.email ?? null, body.address ?? null,
        body.admissionDate ?? null, body.terminationDate ?? null,
        body.employmentType ?? null, body.workSchedule ?? null,
        body.salary ?? null, body.commissionPercent ?? null, body.monthlyGoal ?? null,
        status,
      ]
    );
    const newEmp = insert.rows[0] as EmployeeRow;

    let tempPassword: string | null = null;
    let loginCreated = false;

    if (body.createLogin && body.loginEmail?.trim() && body.loginRole) {
      const validRoles = ["administrador", "recepcionista", "professor"];
      if (!validRoles.includes(body.loginRole)) {
        return res.status(400).json({ error: "Papel de acesso inválido." });
      }
      tempPassword = randomBytes(4).toString("hex"); // ex: "a3f1b2c4"
      const hash = await bcrypt.hash(tempPassword, 10);
      try {
        await db.query(
          `INSERT INTO users (email, password_hash, name, role, employee_id, active)
           VALUES ($1,$2,$3,$4,$5,1)`,
          [body.loginEmail.trim().toLowerCase(), hash, newEmp.name, body.loginRole, newEmp.id]
        );
        loginCreated = true;
      } catch {
        // e-mail já existe — não impede salvar o funcionário
      }
    }

    res.status(201).json({
      employee: rowToEmployee(newEmp, true),
      loginCreated,
      tempPassword,
    });
  } catch (e) {
    console.error("Employee create error:", e);
    res.status(500).json({ error: "Erro ao cadastrar funcionário." });
  }
});

// ── PUT /api/employees/:id ─────────────────────────────────────────────────────

employeesRouter.put("/:id(\\d+)", onlyAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body as {
      name?: string; role?: string; roleType?: string; customRole?: string;
      cpf?: string; rg?: string; birthDate?: string; phone?: string; email?: string; address?: string;
      admissionDate?: string; terminationDate?: string; employmentType?: string; workSchedule?: string;
      salary?: number; commissionPercent?: number; monthlyGoal?: number; status?: string;
      createLogin?: boolean; loginEmail?: string; loginRole?: string;
    };

    await ensureEmployeesTable();
    await ensureUsersTable();
    const db = getDb();

    const existing = await db.query("SELECT * FROM employees WHERE id = $1", [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Funcionário não encontrado." });
    const row = existing.rows[0] as EmployeeRow;

    const validStatuses = ["ativo", "ferias", "afastado", "desligado", "inativo"];
    const newStatus = body.status !== undefined && validStatuses.includes(body.status) ? body.status : row.status;

    await db.query(
      `UPDATE employees SET
        name=$1, role=$2, role_type=$3, custom_role=$4, cpf=$5, rg=$6, birth_date=$7,
        phone=$8, email=$9, address=$10, admission_date=$11, termination_date=$12,
        employment_type=$13, work_schedule=$14, salary=$15,
        commission_percent=$16, monthly_goal=$17,
        status=$18, updated_at=datetime('now')
       WHERE id=$19`,
      [
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
        body.salary !== undefined ? body.salary : row.salary,
        body.commissionPercent !== undefined ? body.commissionPercent : row.commission_percent,
        body.monthlyGoal !== undefined ? body.monthlyGoal : row.monthly_goal,
        newStatus,
        id,
      ]
    );

    // Se status → desligado, bloquear login vinculado
    if (newStatus === "desligado") {
      await db.query("UPDATE users SET active = 0 WHERE employee_id = $1", [id]);
    }

    let tempPassword: string | null = null;
    let loginCreated = false;

    if (body.createLogin && body.loginEmail?.trim() && body.loginRole) {
      const validRoles = ["administrador", "recepcionista", "professor"];
      if (validRoles.includes(body.loginRole)) {
        const existingUser = await db.query("SELECT id FROM users WHERE employee_id = $1", [id]);
        if (existingUser.rows.length === 0) {
          tempPassword = randomBytes(4).toString("hex");
          const hash = await bcrypt.hash(tempPassword, 10);
          try {
            await db.query(
              `INSERT INTO users (email, password_hash, name, role, employee_id, active)
               VALUES ($1,$2,$3,$4,$5,1)`,
              [body.loginEmail.trim().toLowerCase(), hash, body.name?.trim() ?? row.name, body.loginRole, id]
            );
            loginCreated = true;
          } catch { /* e-mail já existe */ }
        }
      }
    }

    const updated = await db.query("SELECT * FROM employees WHERE id = $1", [id]);
    res.json({
      employee: rowToEmployee(updated.rows[0] as EmployeeRow, true),
      loginCreated,
      tempPassword,
    });
  } catch (e) {
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
    if (result.rows.length === 0) return res.status(404).json({ error: "Funcionário não encontrado." });
    res.status(204).send();
  } catch (e) {
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
      attachments: (result.rows as AttachRow[]).map((r) => ({
        id: r.id, employeeId: r.employee_id, type: r.type, url: r.url, fileName: r.file_name, createdAt: r.created_at,
      }))
    });
  } catch (e) {
    console.error("Attachments list error:", e);
    res.status(500).json({ error: "Erro ao listar anexos." });
  }
});

employeesRouter.post("/:id/attachments", onlyAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { type, url, fileName } = req.body as { type?: string; url: string; fileName?: string };
    if (!url?.trim()) return res.status(400).json({ error: "URL/conteúdo do anexo é obrigatório." });
    await ensureEmployeeAttachmentsTable();
    const db = getDb();
    const exists = await db.query("SELECT id FROM employees WHERE id = $1", [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: "Funcionário não encontrado." });
    const insert = await db.query(
      "INSERT INTO employee_attachments (employee_id, type, url, file_name) VALUES ($1,$2,$3,$4) RETURNING *",
      [id, type ?? null, url.trim(), fileName ?? null]
    );
    const r = insert.rows[0] as AttachRow;
    res.status(201).json({
      attachment: { id: r.id, employeeId: r.employee_id, type: r.type, url: r.url, fileName: r.file_name, createdAt: r.created_at }
    });
  } catch (e) {
    console.error("Attachment create error:", e);
    res.status(500).json({ error: "Erro ao salvar anexo." });
  }
});

// ── Folha de pagamento ─────────────────────────────────────────────────────────

/** GET /api/employees/payroll?month=YYYY-MM — folha do mês (todos os funcionários ativos) */
employeesRouter.get("/payroll", onlyAdmin, async (req, res) => {
  try {
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);
    await ensurePayrollTable();
    await ensureEmployeesTable();
    const db = getDb();

    // Busca funcionários ativos com salário cadastrado
    const empRes = await db.query(
      "SELECT id, name, role, salary, commission_percent FROM employees WHERE status IN ('ativo','ferias') AND salary IS NOT NULL ORDER BY name",
      []
    );
    const emps = empRes.rows as { id: number; name: string; role: string; salary: number; commission_percent: number | null }[];

    // Para cada funcionário, busca ou calcula o registro da folha do mês
    const result = await Promise.all(emps.map(async (emp) => {
      // Verifica se já tem lançamento
      const existing = await db.query(
        "SELECT * FROM payroll WHERE employee_id = $1 AND reference_month = $2",
        [emp.id, month]
      );
      if (existing.rows.length > 0) {
        return { employee: { id: emp.id, name: emp.name, role: emp.role }, payroll: rowToPayroll(existing.rows[0] as PayrollRow) };
      }

      // Calcula comissão do mês
      const salesRes = await db.query(
        `SELECT COALESCE(SUM(p.price), 0) as total_sales
         FROM enrollments e JOIN plans p ON p.id = e.plan_id
         WHERE e.employee_id = $1 AND strftime('%Y-%m', e.created_at) = $2`,
        [emp.id, month]
      );
      const totalSales = Number((salesRes.rows[0] as { total_sales: number }).total_sales);
      const commission = emp.commission_percent ? Math.round(totalSales * (emp.commission_percent / 100) * 100) / 100 : 0;
      const total = emp.salary + commission;

      return {
        employee: { id: emp.id, name: emp.name, role: emp.role },
        payroll: {
          id: null, employeeId: emp.id, referenceMonth: month,
          baseSalary: emp.salary, commission, bonus: 0, deductions: 0, total,
          status: "pendente", paidAt: null, notes: null, createdAt: null,
        },
      };
    }));

    // Totais da folha
    const totalFolha = result.reduce((s, r) => s + r.payroll.total, 0);

    res.json({ month, payroll: result, totalFolha: Math.round(totalFolha * 100) / 100 });
  } catch (e) {
    console.error("Payroll list error:", e);
    res.status(500).json({ error: "Erro ao gerar folha." });
  }
});

/** POST /api/employees/payroll — salvar/confirmar pagamento de um funcionário */
employeesRouter.post("/payroll", onlyAdmin, async (req, res) => {
  try {
    const body = req.body as {
      employeeId: number; referenceMonth: string;
      baseSalary: number; commission?: number; bonus?: number; deductions?: number;
      notes?: string;
    };
    if (!body.employeeId || !body.referenceMonth || body.baseSalary == null) {
      return res.status(400).json({ error: "employeeId, referenceMonth e baseSalary são obrigatórios." });
    }
    await ensurePayrollTable();
    const db = getDb();

    const total = body.baseSalary + (body.commission ?? 0) + (body.bonus ?? 0) - (body.deductions ?? 0);

    // UPSERT — um registro por funcionário por mês
    const existing = await db.query(
      "SELECT id FROM payroll WHERE employee_id = $1 AND reference_month = $2",
      [body.employeeId, body.referenceMonth]
    );

    let row: PayrollRow;
    if (existing.rows.length > 0) {
      const r = await db.query(
        `UPDATE payroll SET base_salary=$1, commission=$2, bonus=$3, deductions=$4, total=$5, notes=$6
         WHERE employee_id=$7 AND reference_month=$8 RETURNING *`,
        [body.baseSalary, body.commission ?? 0, body.bonus ?? 0, body.deductions ?? 0, total, body.notes ?? null, body.employeeId, body.referenceMonth]
      );
      row = r.rows[0] as PayrollRow;
    } else {
      const r = await db.query(
        `INSERT INTO payroll (employee_id, reference_month, base_salary, commission, bonus, deductions, total, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [body.employeeId, body.referenceMonth, body.baseSalary, body.commission ?? 0, body.bonus ?? 0, body.deductions ?? 0, total, body.notes ?? null]
      );
      row = r.rows[0] as PayrollRow;
    }

    res.status(201).json({ payroll: rowToPayroll(row) });
  } catch (e) {
    console.error("Payroll save error:", e);
    res.status(500).json({ error: "Erro ao salvar folha." });
  }
});

/** PATCH /api/employees/payroll/:id/pay — marcar como pago */
employeesRouter.patch("/payroll/:id/pay", onlyAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await ensurePayrollTable();
    const db = getDb();
    const result = await db.query(
      "UPDATE payroll SET status='pago', paid_at=datetime('now') WHERE id=$1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Registro não encontrado." });
    res.json({ payroll: rowToPayroll(result.rows[0] as PayrollRow) });
  } catch (e) {
    console.error("Payroll pay error:", e);
    res.status(500).json({ error: "Erro ao marcar pagamento." });
  }
});

/** GET /api/employees/payroll/summary — custo total da folha por mês (para o dashboard financeiro) */
employeesRouter.get("/payroll/summary", onlyAdmin, async (req, res) => {
  try {
    const months = parseInt((req.query.months as string) ?? "6", 10);
    await ensurePayrollTable();
    const db = getDb();
    const result = await db.query(
      `SELECT reference_month, SUM(total) as total_cost, COUNT(*) as employee_count
       FROM payroll
       GROUP BY reference_month
       ORDER BY reference_month DESC
       LIMIT $1`,
      [months]
    );
    res.json({
      summary: (result.rows as { reference_month: string; total_cost: number; employee_count: number }[]).map((r) => ({
        month: r.reference_month,
        totalCost: Math.round(Number(r.total_cost) * 100) / 100,
        employeeCount: r.employee_count,
      }))
    });
  } catch (e) {
    console.error("Payroll summary error:", e);
    res.status(500).json({ error: "Erro ao buscar resumo." });
  }
});

employeesRouter.delete("/attachments/:attachId", onlyAdmin, async (req, res) => {
  try {
    const attachId = parseInt(req.params.attachId, 10);
    await ensureEmployeeAttachmentsTable();
    const db = getDb();
    const result = await db.query("DELETE FROM employee_attachments WHERE id = $1 RETURNING id", [attachId]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Anexo não encontrado." });
    res.status(204).send();
  } catch (e) {
    console.error("Attachment delete error:", e);
    res.status(500).json({ error: "Erro ao remover anexo." });
  }
});
