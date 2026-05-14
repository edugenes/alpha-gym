import { Router } from "express";
import { getDb } from "../db/client.js";
import {
  ensureStudentsTable,
  ensureStudentWorkoutsTable,
  ensureWorkoutTemplatesTable,
  ensureWorkoutTemplateItemsTable,
  ensureExercisesTable,
  ensureAssessmentsTable,
  ensureInstallmentsTable,
  ensureCheckInsTable,
  ensureWorkoutCompletionsTable,
  ensureNotificationsTable,
} from "../db/schema.js";
import { requireStudentAuth } from "../middleware/auth.js";

export const studentRouter = Router();
studentRouter.use(requireStudentAuth);

interface ItemRow {
  id: number;
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  sets: string | null;
  reps: string | null;
  sort_order: number;
}

/** GET /api/student/workouts — Minhas fichas vinculadas */
studentRouter.get("/workouts", async (req, res) => {
  try {
    const studentId = req.studentId!;
    await ensureStudentWorkoutsTable();
    await ensureWorkoutTemplatesTable();
    const db = getDb();
    const result = await db.query(
      `SELECT sw.id, sw.student_id, sw.template_id, sw.assigned_at, wt.name as template_name
       FROM student_workouts sw JOIN workout_templates wt ON wt.id = sw.template_id
       WHERE sw.student_id = $1 ORDER BY sw.assigned_at DESC`,
      [studentId]
    );
    const list = (result.rows as { id: number; student_id: number; template_id: number; assigned_at: string; template_name: string }[]).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      templateId: r.template_id,
      templateName: r.template_name,
      assignedAt: r.assigned_at,
    }));
    res.json({ workouts: list });
  } catch (e) {
    console.error("Student workouts list error:", e);
    res.status(500).json({ error: "Erro ao listar treinos." });
  }
});

/** GET /api/student/workouts/:studentWorkoutId — Detalhe da ficha (com exercícios) */
studentRouter.get("/workouts/:studentWorkoutId", async (req, res) => {
  try {
    const studentId = req.studentId!;
    const studentWorkoutId = parseInt(req.params.studentWorkoutId, 10);
    if (Number.isNaN(studentWorkoutId)) return res.status(400).json({ error: "ID inválido." });
    await ensureStudentWorkoutsTable();
    await ensureWorkoutTemplatesTable();
    await ensureWorkoutTemplateItemsTable();
    await ensureExercisesTable();
    const db = getDb();
    const sw = await db.query(
      "SELECT id, template_id FROM student_workouts WHERE id = $1 AND student_id = $2",
      [studentWorkoutId, studentId]
    );
    if (sw.rows.length === 0) return res.status(404).json({ error: "Ficha não encontrada." });
    const { template_id: templateId } = sw.rows[0] as { id: number; template_id: number };
    const template = await db.query("SELECT id, name FROM workout_templates WHERE id = $1", [templateId]);
    if (template.rows.length === 0) return res.status(404).json({ error: "Ficha não encontrada." });
    const items = await db.query(
      `SELECT i.id, i.exercise_id, i.sets, i.reps, i.sort_order, e.name as exercise_name, e.muscle_group
       FROM workout_template_items i JOIN exercises e ON e.id = i.exercise_id
       WHERE i.template_id = $1 ORDER BY i.sort_order, i.id`,
      [templateId]
    );
    const t = template.rows[0] as { id: number; name: string };
    res.json({
      studentWorkoutId,
      template: {
        id: t.id,
        name: t.name,
        items: (items.rows as ItemRow[]).map((i) => ({
          id: i.id,
          exerciseId: i.exercise_id,
          exerciseName: i.exercise_name,
          muscleGroup: i.muscle_group,
          sets: i.sets,
          reps: i.reps,
          sortOrder: i.sort_order,
        })),
      },
    });
  } catch (e) {
    console.error("Student workout detail error:", e);
    res.status(500).json({ error: "Erro ao buscar ficha." });
  }
});

/** POST /api/student/workouts/:studentWorkoutId/complete — Marcar treino como concluído */
studentRouter.post("/workouts/:studentWorkoutId/complete", async (req, res) => {
  try {
    const studentId = req.studentId!;
    const studentWorkoutId = parseInt(req.params.studentWorkoutId, 10);
    if (Number.isNaN(studentWorkoutId)) return res.status(400).json({ error: "ID inválido." });
    await ensureWorkoutCompletionsTable();
    await ensureStudentWorkoutsTable();
    const db = getDb();
    const sw = await db.query(
      "SELECT id FROM student_workouts WHERE id = $1 AND student_id = $2",
      [studentWorkoutId, studentId]
    );
    if (sw.rows.length === 0) return res.status(404).json({ error: "Ficha não encontrada." });
    const insert = await db.query(
      "INSERT INTO workout_completions (student_id, student_workout_id) VALUES ($1, $2) RETURNING id, completed_at",
      [studentId, studentWorkoutId]
    );
    const r = insert.rows[0] as { id: number; completed_at: string };
    res.status(201).json({ completion: { id: r.id, completedAt: r.completed_at } });
  } catch (e) {
    console.error("Student workout complete error:", e);
    res.status(500).json({ error: "Erro ao registrar treino." });
  }
});

/** GET /api/student/workouts/completions — Histórico de treinos realizados */
studentRouter.get("/workouts/completions/history", async (req, res) => {
  try {
    const studentId = req.studentId!;
    await ensureWorkoutCompletionsTable();
    const db = getDb();
    const result = await db.query(
      `SELECT wc.id, wc.student_workout_id, wc.completed_at, wt.name as template_name
       FROM workout_completions wc
       JOIN student_workouts sw ON sw.id = wc.student_workout_id
       JOIN workout_templates wt ON wt.id = sw.template_id
       WHERE wc.student_id = $1 ORDER BY wc.completed_at DESC LIMIT 100`,
      [studentId]
    );
    const list = (result.rows as { id: number; student_workout_id: number; completed_at: string; template_name: string }[]).map((r) => ({
      id: r.id,
      studentWorkoutId: r.student_workout_id,
      templateName: r.template_name,
      completedAt: r.completed_at,
    }));
    res.json({ completions: list });
  } catch (e) {
    console.error("Student completions history error:", e);
    res.status(500).json({ error: "Erro ao listar histórico." });
  }
});

/** GET /api/student/assessments — Minhas avaliações físicas */
studentRouter.get("/assessments", async (req, res) => {
  try {
    const studentId = req.studentId!;
    await ensureAssessmentsTable();
    const db = getDb();
    const result = await db.query(
      "SELECT id, assessment_date, weight, height, imc, fat_percent, lean_mass, notes, created_at FROM assessments WHERE student_id = $1 ORDER BY assessment_date DESC",
      [studentId]
    );
    const list = (result.rows as { id: number; assessment_date: string; weight: string; height: string; imc: string | null; fat_percent: string | null; lean_mass: string | null; notes: string | null; created_at: string }[]).map((r) => ({
      id: r.id,
      assessmentDate: r.assessment_date,
      weight: Number(r.weight),
      height: Number(r.height),
      imc: r.imc != null ? Number(r.imc) : null,
      fatPercent: r.fat_percent != null ? Number(r.fat_percent) : null,
      leanMass: r.lean_mass != null ? Number(r.lean_mass) : null,
      notes: r.notes,
      createdAt: r.created_at,
    }));
    res.json({ assessments: list });
  } catch (e) {
    console.error("Student assessments error:", e);
    res.status(500).json({ error: "Erro ao listar avaliações." });
  }
});

/** GET /api/student/installments — Minhas mensalidades */
studentRouter.get("/installments", async (req, res) => {
  try {
    const studentId = req.studentId!;
    await ensureInstallmentsTable();
    const db = getDb();
    const result = await db.query(
      `SELECT id, due_date, amount, status, paid_at, created_at FROM installments
       WHERE student_id = $1 ORDER BY due_date DESC`,
      [studentId]
    );
    const list = (result.rows as { id: number; due_date: string; amount: string; status: string; paid_at: string | null; created_at: string }[]).map((r) => ({
      id: r.id,
      dueDate: r.due_date,
      amount: Number(r.amount),
      status: r.status,
      paidAt: r.paid_at,
      createdAt: r.created_at,
    }));
    res.json({ installments: list });
  } catch (e) {
    console.error("Student installments error:", e);
    res.status(500).json({ error: "Erro ao listar mensalidades." });
  }
});

/** GET /api/student/check-ins — Meu histórico de entradas */
studentRouter.get("/check-ins", async (req, res) => {
  try {
    const studentId = req.studentId!;
    await ensureCheckInsTable();
    const db = getDb();
    const result = await db.query(
      "SELECT id, created_at FROM check_ins WHERE student_id = $1 ORDER BY created_at DESC LIMIT 100",
      [studentId]
    );
    const list = (result.rows as { id: number; created_at: string }[]).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
    }));
    res.json({ checkIns: list });
  } catch (e) {
    console.error("Student check-ins error:", e);
    res.status(500).json({ error: "Erro ao listar entradas." });
  }
});

/** POST /api/student/check-in — Registrar minha entrada (check-in digital) */
studentRouter.post("/check-in", async (req, res) => {
  try {
    const studentId = req.studentId!;
    await ensureCheckInsTable();
    await ensureStudentsTable();
    const db = getDb();
    const student = await db.query("SELECT id, status FROM students WHERE id = $1", [studentId]);
    if (student.rows.length === 0) return res.status(404).json({ error: "Aluno não encontrado." });
    const status = (student.rows[0] as { status: string }).status;
    if (status === "inadimplente") {
      return res.status(403).json({ error: "Acesso bloqueado por inadimplência. Regularize sua situação na recepção." });
    }
    if (status === "cancelado") {
      return res.status(403).json({ error: "Matrícula cancelada." });
    }
    const insert = await db.query(
      "INSERT INTO check_ins (student_id) VALUES ($1) RETURNING id, student_id, created_at",
      [studentId]
    );
    const r = insert.rows[0] as { id: number; student_id: number; created_at: string };
    res.status(201).json({ checkIn: { id: r.id, studentId: r.student_id, createdAt: r.created_at } });
  } catch (e) {
    console.error("Student check-in error:", e);
    res.status(500).json({ error: "Erro ao registrar entrada." });
  }
});

/** GET /api/student/notifications — Minhas notificações */
studentRouter.get("/notifications", async (req, res) => {
  try {
    const studentId = req.studentId!;
    await ensureNotificationsTable();
    const db = getDb();
    const result = await db.query(
      "SELECT id, title, body, read_at, created_at FROM notifications WHERE student_id = $1 ORDER BY created_at DESC LIMIT 50",
      [studentId]
    );
    const list = (result.rows as { id: number; title: string; body: string | null; read_at: string | null; created_at: string }[]).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      readAt: r.read_at,
      createdAt: r.created_at,
    }));
    res.json({ notifications: list });
  } catch (e) {
    console.error("Student notifications error:", e);
    res.status(500).json({ error: "Erro ao listar notificações." });
  }
});

/** PATCH /api/student/notifications/:id/read — Marcar como lida */
studentRouter.patch("/notifications/:id/read", async (req, res) => {
  try {
    const studentId = req.studentId!;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensureNotificationsTable();
    const db = getDb();
    const result = await db.query(
      "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE id = $1 AND student_id = $2 RETURNING id, read_at",
      [id, studentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Notificação não encontrada." });
    const r = result.rows[0] as { id: number; read_at: string };
    res.json({ notification: { id: r.id, readAt: r.read_at } });
  } catch (e) {
    console.error("Student notification read error:", e);
    res.status(500).json({ error: "Erro ao atualizar notificação." });
  }
});
