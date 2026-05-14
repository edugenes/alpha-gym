import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensureCheckInsTable, ensureStudentsTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export const checkInsRouter = Router();
checkInsRouter.use(requireAuth);

checkInsRouter.post("/", async (req, res) => {
  try {
    const body = req.body as { studentId: number };
    if (!body.studentId) return res.status(400).json({ error: "studentId é obrigatório." });
    await ensureCheckInsTable();
    await ensureStudentsTable();
    const db = getDb();
    const student = await db.query("SELECT id FROM students WHERE id = $1", [body.studentId]);
    if (student.rows.length === 0) return res.status(404).json({ error: "Aluno não encontrado." });
    const insert = await db.query(
      "INSERT INTO check_ins (student_id) VALUES ($1) RETURNING id, student_id, created_at",
      [body.studentId]
    );
    const r = insert.rows[0] as { id: number; student_id: number; created_at: string };
    res.status(201).json({ checkIn: { id: r.id, studentId: r.student_id, createdAt: r.created_at } });
  } catch (e) {
    console.error("Check-in create error:", e);
    res.status(500).json({ error: "Erro ao registrar entrada." });
  }
});
