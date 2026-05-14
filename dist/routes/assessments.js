import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensureAssessmentsTable, ensureStudentsTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
export const assessmentsRouter = Router();
assessmentsRouter.use(requireAuth);
function rowToAssessment(r) {
    return {
        id: r.id,
        studentId: r.student_id,
        assessmentDate: r.assessment_date,
        weight: Number(r.weight),
        height: Number(r.height),
        imc: r.imc != null ? Number(r.imc) : null,
        fatPercent: r.fat_percent != null ? Number(r.fat_percent) : null,
        leanMass: r.lean_mass != null ? Number(r.lean_mass) : null,
        measures: r.measures,
        photoBeforeUrl: r.photo_before_url,
        photoAfterUrl: r.photo_after_url,
        notes: r.notes,
        createdAt: r.created_at,
    };
}
function calcImc(weight, height) {
    if (height <= 0)
        return 0;
    return Math.round((weight / (height * height)) * 100) / 100;
}
assessmentsRouter.get("/", async (req, res) => {
    try {
        const studentId = req.query.student_id;
        if (!studentId) {
            return res.status(400).json({ error: "student_id é obrigatório." });
        }
        await ensureAssessmentsTable();
        const db = getDb();
        const result = await db.query("SELECT * FROM assessments WHERE student_id = $1 ORDER BY assessment_date DESC", [studentId]);
        res.json({ assessments: result.rows.map((r) => rowToAssessment(r)) });
    }
    catch (e) {
        console.error("Assessments list error:", e);
        res.status(500).json({ error: "Erro ao listar avaliações." });
    }
});
assessmentsRouter.get("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        await ensureAssessmentsTable();
        const db = getDb();
        const result = await db.query("SELECT * FROM assessments WHERE id = $1", [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Avaliação não encontrada." });
        res.json({ assessment: rowToAssessment(result.rows[0]) });
    }
    catch (e) {
        console.error("Assessment get error:", e);
        res.status(500).json({ error: "Erro ao buscar avaliação." });
    }
});
assessmentsRouter.post("/", async (req, res) => {
    try {
        const body = req.body;
        if (!body.studentId || !body.assessmentDate || body.weight == null || body.height == null) {
            return res.status(400).json({ error: "Aluno, data, peso e altura são obrigatórios." });
        }
        await ensureAssessmentsTable();
        await ensureStudentsTable();
        const db = getDb();
        const student = await db.query("SELECT id FROM students WHERE id = $1", [body.studentId]);
        if (student.rows.length === 0)
            return res.status(404).json({ error: "Aluno não encontrado." });
        const imc = calcImc(body.weight, body.height);
        const insert = await db.query(`INSERT INTO assessments (student_id, assessment_date, weight, height, imc, fat_percent, lean_mass, measures, photo_before_url, photo_after_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`, [
            body.studentId,
            body.assessmentDate.split("T")[0],
            body.weight,
            body.height,
            imc,
            body.fatPercent ?? null,
            body.leanMass ?? null,
            body.measures ? JSON.stringify(body.measures) : null,
            body.photoBeforeUrl ?? null,
            body.photoAfterUrl ?? null,
            body.notes ?? null,
        ]);
        res.status(201).json({ assessment: rowToAssessment(insert.rows[0]) });
    }
    catch (e) {
        console.error("Assessment create error:", e);
        res.status(500).json({ error: "Erro ao registrar avaliação." });
    }
});
assessmentsRouter.put("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        const body = req.body;
        await ensureAssessmentsTable();
        const db = getDb();
        const existing = await db.query("SELECT * FROM assessments WHERE id = $1", [id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ error: "Avaliação não encontrada." });
        const row = existing.rows[0];
        const weight = body.weight ?? Number(row.weight);
        const height = body.height ?? Number(row.height);
        const imc = calcImc(weight, height);
        await db.query(`UPDATE assessments SET assessment_date = $1, weight = $2, height = $3, imc = $4, fat_percent = $5, lean_mass = $6, measures = $7, photo_before_url = $8, photo_after_url = $9, notes = $10
       WHERE id = $11`, [
            body.assessmentDate?.split("T")[0] ?? row.assessment_date,
            weight,
            height,
            imc,
            body.fatPercent ?? row.fat_percent,
            body.leanMass ?? row.lean_mass,
            body.measures !== undefined ? JSON.stringify(body.measures) : row.measures,
            body.photoBeforeUrl ?? row.photo_before_url,
            body.photoAfterUrl ?? row.photo_after_url,
            body.notes ?? row.notes,
            id,
        ]);
        const updated = await db.query("SELECT * FROM assessments WHERE id = $1", [id]);
        res.json({ assessment: rowToAssessment(updated.rows[0]) });
    }
    catch (e) {
        console.error("Assessment update error:", e);
        res.status(500).json({ error: "Erro ao atualizar avaliação." });
    }
});
assessmentsRouter.delete("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        await ensureAssessmentsTable();
        const db = getDb();
        const result = await db.query("DELETE FROM assessments WHERE id = $1 RETURNING id", [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Avaliação não encontrada." });
        res.status(204).send();
    }
    catch (e) {
        console.error("Assessment delete error:", e);
        res.status(500).json({ error: "Erro ao excluir avaliação." });
    }
});
