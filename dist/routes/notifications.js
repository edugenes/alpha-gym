import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensureNotificationsTable, ensureStudentsTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
/** POST /api/notifications — Enviar notificação para um aluno (admin/recepção) */
notificationsRouter.post("/", async (req, res) => {
    try {
        const body = req.body;
        if (!body.studentId || !body.title?.trim()) {
            return res.status(400).json({ error: "studentId e title são obrigatórios." });
        }
        await ensureNotificationsTable();
        await ensureStudentsTable();
        const db = getDb();
        const student = await db.query("SELECT id FROM students WHERE id = $1", [body.studentId]);
        if (student.rows.length === 0)
            return res.status(404).json({ error: "Aluno não encontrado." });
        const insert = await db.query("INSERT INTO notifications (student_id, title, body) VALUES ($1, $2, $3) RETURNING id, student_id, title, body, created_at", [body.studentId, body.title.trim(), body.body?.trim() ?? null]);
        const r = insert.rows[0];
        res.status(201).json({
            notification: {
                id: r.id,
                studentId: r.student_id,
                title: r.title,
                body: r.body,
                createdAt: r.created_at,
            },
        });
    }
    catch (e) {
        console.error("Notification create error:", e);
        res.status(500).json({ error: "Erro ao enviar notificação." });
    }
});
