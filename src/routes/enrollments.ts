import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensureEnrollmentsTable, ensurePlansTable, ensureStudentsTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export const enrollmentsRouter = Router();
enrollmentsRouter.use(requireAuth);

interface EnrollmentRow {
  id: number;
  student_id: number;
  plan_id: number;
  start_date: string;
  end_date: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToEnrollment(r: EnrollmentRow, planName?: string) {
  return {
    id: r.id,
    studentId: r.student_id,
    planId: r.plan_id,
    planName: planName ?? null,
    startDate: r.start_date,
    endDate: r.end_date,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

enrollmentsRouter.get("/", async (req, res) => {
  try {
    await ensureEnrollmentsTable();
    await ensurePlansTable();
    const db = getDb();
    const { student_id: studentId } = req.query;
    let query = `
      SELECT e.*, p.name as plan_name
      FROM enrollments e
      JOIN plans p ON p.id = e.plan_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    if (studentId) {
      params.push(Number(studentId));
      query += ` AND e.student_id = $${params.length}`;
    }
    query += " ORDER BY e.start_date DESC";
    const result = await db.query(query, params);
    const enrollments = (result.rows as (EnrollmentRow & { plan_name: string })[]).map((r) =>
      rowToEnrollment(r, r.plan_name)
    );
    res.json({ enrollments });
  } catch (e) {
    console.error("Enrollments list error:", e);
    res.status(500).json({ error: "Erro ao listar matrículas." });
  }
});

enrollmentsRouter.get("/student/:studentId/current", async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    if (Number.isNaN(studentId)) return res.status(400).json({ error: "ID do aluno inválido." });
    await ensureEnrollmentsTable();
    await ensurePlansTable();
    const db = getDb();
    const result = await db.query(
      `SELECT e.*, p.name as plan_name FROM enrollments e
       JOIN plans p ON p.id = e.plan_id
       WHERE e.student_id = $1 AND e.active = 1
       ORDER BY e.end_date DESC LIMIT 1`,
      [studentId]
    );
    if (result.rows.length === 0) return res.json({ enrollment: null });
    const r = result.rows[0] as EnrollmentRow & { plan_name: string };
    res.json({ enrollment: rowToEnrollment(r, r.plan_name) });
  } catch (e) {
    console.error("Current enrollment error:", e);
    res.status(500).json({ error: "Erro ao buscar matrícula atual." });
  }
});

enrollmentsRouter.post("/", async (req, res) => {
  try {
    const body = req.body as { studentId: number; planId: number; startDate: string };
    if (!body.studentId || !body.planId || !body.startDate) {
      return res.status(400).json({ error: "Aluno, plano e data de início são obrigatórios." });
    }
    await ensureEnrollmentsTable();
    await ensurePlansTable();
    await ensureStudentsTable();
    const db = getDb();
    const planResult = await db.query("SELECT id, name, duration_days FROM plans WHERE id = $1", [body.planId]);
    if (planResult.rows.length === 0) return res.status(404).json({ error: "Plano não encontrado." });
    const plan = planResult.rows[0] as { id: number; name: string; duration_days: number };
    const studentResult = await db.query("SELECT id FROM students WHERE id = $1", [body.studentId]);
    if (studentResult.rows.length === 0) return res.status(404).json({ error: "Aluno não encontrado." });

    const startDate = body.startDate.split("T")[0];
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + plan.duration_days);
    const endDate = end.toISOString().split("T")[0];

    await db.query("UPDATE enrollments SET active = FALSE WHERE student_id = $1", [body.studentId]);

    const insert = await db.query(
      `INSERT INTO enrollments (student_id, plan_id, start_date, end_date, active)
       VALUES ($1, $2, $3, $4, 1) RETURNING *`,
      [body.studentId, body.planId, startDate, endDate]
    );
    await db.query(
      "UPDATE students SET plan_name = $1, due_date = $2, updated_at = datetime('now') WHERE id = $3",
      [plan.name, endDate, body.studentId]
    );
    const row = insert.rows[0] as EnrollmentRow;
    res.status(201).json({ enrollment: rowToEnrollment(row, plan.name) });
  } catch (e) {
    console.error("Enrollment create error:", e);
    res.status(500).json({ error: "Erro ao criar matrícula." });
  }
});

enrollmentsRouter.put("/:id/deactivate", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensureEnrollmentsTable();
    const db = getDb();
    const result = await db.query("UPDATE enrollments SET active = FALSE, updated_at = datetime('now') WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Matrícula não encontrada." });
    const row = result.rows[0] as EnrollmentRow;
    await db.query("UPDATE students SET plan_name = NULL, due_date = NULL, updated_at = datetime('now') WHERE id = $1", [row.student_id]);
    res.json({ enrollment: rowToEnrollment(row) });
  } catch (e) {
    console.error("Enrollment deactivate error:", e);
    res.status(500).json({ error: "Erro ao encerrar matrícula." });
  }
});
