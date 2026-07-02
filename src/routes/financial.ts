import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensureInstallmentsTable, ensureEnrollmentsTable, ensurePlansTable, ensureStudentsTable, ensurePayrollTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export const financialRouter = Router();
financialRouter.use(requireAuth);

interface InstallmentRow {
  id: number;
  student_id: number;
  plan_id: number | null;
  due_date: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

function formatRow(i: InstallmentRow & { student_name?: string }) {
  return {
    id: i.id,
    studentId: i.student_id,
    studentName: i.student_name ?? null,
    planId: i.plan_id,
    dueDate: i.due_date,
    amount: Number(i.amount),
    status: i.status,
    paidAt: i.paid_at,
    createdAt: i.created_at,
  };
}

financialRouter.get("/installments", async (req, res) => {
  try {
    await ensureInstallmentsTable();
    const db = getDb();
    await db.query(
      `UPDATE students SET status = 'inadimplente', updated_at = datetime('now')
       WHERE id IN (SELECT DISTINCT student_id FROM installments WHERE status = 'pending' AND date(due_date) < date('now'))`
    );
    const { month, year, status, student_id, date_from, date_to } = req.query as {
      month?: string; year?: string; status?: string; student_id?: string; date_from?: string; date_to?: string;
    };
    let query = `
      SELECT i.id, i.student_id, i.plan_id, i.due_date, i.amount,
             CASE WHEN i.status = 'pending' AND date(i.due_date) < date('now') THEN 'overdue' ELSE i.status END as status,
             i.paid_at, i.created_at, s.name as student_name
      FROM installments i
      JOIN students s ON s.id = i.student_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let idx = 1;
    if (student_id) {
      params.push(Number(student_id));
      query += ` AND i.student_id = $${idx}`;
      idx += 1;
    }
    if (date_from) {
      params.push(date_from);
      query += ` AND date(i.due_date) >= $${idx}`;
      idx += 1;
    }
    if (date_to) {
      params.push(date_to);
      query += ` AND date(i.due_date) <= $${idx}`;
      idx += 1;
    }
    if (!date_from && !date_to && month && year) {
      params.push(year, month.padStart(2, "0"));
      query += ` AND strftime('%Y', i.due_date) = $${idx} AND strftime('%m', i.due_date) = $${idx + 1}`;
      idx += 2;
    }
    if (status && ["pending", "paid", "overdue"].includes(status)) {
      params.push(status);
      query += ` AND (CASE WHEN i.status = 'pending' AND date(i.due_date) < date('now') THEN 'overdue' ELSE i.status END) = $${idx}`;
      idx += 1;
    }
    query += " ORDER BY i.due_date DESC, s.name";
    const result = await db.query(query, params);
    res.json({
      installments: (result.rows as (InstallmentRow & { student_name: string })[]).map((r) => formatRow(r)),
    });
  } catch (e) {
    console.error("Installments list error:", e);
    res.status(500).json({ error: "Erro ao listar mensalidades." });
  }
});

financialRouter.post("/installments/generate", async (req, res) => {
  try {
    const body = req.body as { month: number; year: number };
    const month = body.month ?? new Date().getMonth() + 1;
    const year = body.year ?? new Date().getFullYear();
    await ensureInstallmentsTable();
    await ensureEnrollmentsTable();
    await ensurePlansTable();
    await ensureStudentsTable();
    const db = getDb();
    const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const lastDayStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const enrollments = await db.query(
      `SELECT e.student_id, e.plan_id, p.price
       FROM enrollments e
       JOIN plans p ON p.id = e.plan_id
       WHERE e.active = 1 AND e.start_date <= $1 AND e.end_date >= $2`,
      [lastDayStr, firstDay]
    );
    const dueDate = `${year}-${String(month).padStart(2, "0")}-10`;
    let created = 0;
    for (const enr of enrollments.rows as { student_id: number; plan_id: number; price: number }[]) {
      const existing = await db.query(
        "SELECT id FROM installments WHERE student_id = $1 AND due_date = $2",
        [enr.student_id, dueDate]
      );
      if (existing.rows.length > 0) continue;
      await db.query(
        "INSERT INTO installments (student_id, plan_id, due_date, amount, status) VALUES ($1, $2, $3, $4, 'pending')",
        [enr.student_id, enr.plan_id, dueDate, enr.price]
      );
      created++;
    }
    res.json({ created, message: `${created} mensalidade(s) gerada(s).` });
  } catch (e) {
    console.error("Generate installments error:", e);
    res.status(500).json({ error: "Erro ao gerar mensalidades." });
  }
});

financialRouter.post("/installments/:id/pay", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensureInstallmentsTable();
    const db = getDb();
    await db.query(
      "UPDATE installments SET status = 'paid', paid_at = datetime('now') WHERE id = $1",
      [id]
    );
    const result = await db.query("SELECT * FROM installments WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Mensalidade não encontrada." });
    const row = result.rows[0] as InstallmentRow;
    const student = await db.query("SELECT id, status FROM students WHERE id = $1", [row.student_id]);
    if (student.rows.length > 0 && (student.rows[0] as { status: string }).status === "inadimplente") {
      await db.query("UPDATE students SET status = 'ativo', updated_at = datetime('now') WHERE id = $1", [row.student_id]);
    }
    res.json({ installment: formatRow(row) });
  } catch (e) {
    console.error("Pay installment error:", e);
    res.status(500).json({ error: "Erro ao registrar pagamento." });
  }
});

financialRouter.get("/daily", async (_req, res) => {
  try {
    await ensureInstallmentsTable();
    const db = getDb();
    const result = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM installments WHERE status = 'paid' AND date(paid_at) = date('now')`
    );
    const row = result.rows[0] as { total: number; count: number };
    res.json({ total: Number(row.total), count: Number(row.count) });
  } catch (e) {
    console.error("Daily cash error:", e);
    res.status(500).json({ error: "Erro ao buscar caixa do dia." });
  }
});

financialRouter.get("/report", async (req, res) => {
  try {
    const { month, year, format } = req.query as { month?: string; year?: string; format?: string };
    const m = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    const mStr = String(m).padStart(2, "0");
    await ensureInstallmentsTable();
    const db = getDb();
    const summary = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_received,
         COALESCE(SUM(CASE WHEN status IN ('pending', 'overdue') THEN amount ELSE 0 END), 0) as total_pending,
         SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
         SUM(CASE WHEN status IN ('pending', 'overdue') THEN 1 ELSE 0 END) as pending_count
       FROM installments
       WHERE strftime('%m', due_date) = $1 AND strftime('%Y', due_date) = $2`,
      [mStr, String(y)]
    );
    const row = summary.rows[0] as { total_received: number; total_pending: number; paid_count: number; pending_count: number };

    // Custo da folha de pagamento do mês
    await ensurePayrollTable();
    const monthStr = `${String(y)}-${mStr}`;
    const payrollRes = await db.query(
      "SELECT COALESCE(SUM(total), 0) as payroll_cost FROM payroll WHERE reference_month = $1",
      [monthStr]
    );
    const payrollCost = Number((payrollRes.rows[0] as { payroll_cost: number }).payroll_cost);

    const report = {
      month: m,
      year: y,
      totalReceived: Number(row.total_received),
      totalPending: Number(row.total_pending),
      paidCount: Number(row.paid_count),
      pendingCount: Number(row.pending_count),
      payrollCost,
      netResult: Number(row.total_received) - payrollCost,
    };
    if (format === "csv") {
      const list = await db.query(
        `SELECT i.id, s.name as student_name, i.due_date, i.amount, i.status, i.paid_at
         FROM installments i JOIN students s ON s.id = i.student_id
         WHERE strftime('%m', i.due_date) = $1 AND strftime('%Y', i.due_date) = $2
         ORDER BY i.due_date, s.name`,
        [mStr, String(y)]
      );
      const lines = ["id;aluno;vencimento;valor;status;pago_em"];
      for (const r of list.rows as { id: number; student_name: string; due_date: string; amount: number; status: string; paid_at: string | null }[]) {
        lines.push(`${r.id};${r.student_name};${r.due_date};${r.amount};${r.status};${r.paid_at ?? ""}`);
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=relatorio-${y}-${m}.csv`);
      return res.send("\uFEFF" + lines.join("\r\n"));
    }
    res.json(report);
  } catch (e) {
    console.error("Report error:", e);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});
