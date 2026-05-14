import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensureExercisesTable, ensureWorkoutTemplatesTable, ensureWorkoutTemplateItemsTable, ensureStudentWorkoutsTable, ensureStudentsTable, } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
export const workoutsRouter = Router();
workoutsRouter.use(requireAuth);
workoutsRouter.get("/templates", async (_req, res) => {
    try {
        await ensureWorkoutTemplatesTable();
        const db = getDb();
        const result = await db.query("SELECT * FROM workout_templates ORDER BY name");
        const templates = result.rows.map((t) => ({
            id: t.id,
            name: t.name,
            createdAt: t.created_at,
        }));
        res.json({ templates });
    }
    catch (e) {
        console.error("Templates list error:", e);
        res.status(500).json({ error: "Erro ao listar fichas." });
    }
});
workoutsRouter.get("/templates/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        await ensureWorkoutTemplatesTable();
        await ensureWorkoutTemplateItemsTable();
        await ensureExercisesTable();
        const db = getDb();
        const template = await db.query("SELECT * FROM workout_templates WHERE id = $1", [id]);
        if (template.rows.length === 0)
            return res.status(404).json({ error: "Ficha não encontrada." });
        const t = template.rows[0];
        const items = await db.query(`SELECT i.id, i.template_id, i.exercise_id, i.sets, i.reps, i.sort_order, e.name as exercise_name, e.muscle_group
       FROM workout_template_items i JOIN exercises e ON e.id = i.exercise_id
       WHERE i.template_id = $1 ORDER BY i.sort_order, i.id`, [id]);
        res.json({
            template: {
                id: t.id,
                name: t.name,
                createdAt: t.created_at,
                items: items.rows.map((i) => ({
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
    }
    catch (e) {
        console.error("Template get error:", e);
        res.status(500).json({ error: "Erro ao buscar ficha." });
    }
});
workoutsRouter.post("/templates", async (req, res) => {
    try {
        const body = req.body;
        if (!body.name?.trim())
            return res.status(400).json({ error: "Nome da ficha é obrigatório." });
        await ensureWorkoutTemplatesTable();
        const db = getDb();
        const insert = await db.query("INSERT INTO workout_templates (name) VALUES ($1) RETURNING *", [body.name.trim()]);
        const t = insert.rows[0];
        res.status(201).json({ template: { id: t.id, name: t.name, createdAt: t.created_at, items: [] } });
    }
    catch (e) {
        console.error("Template create error:", e);
        res.status(500).json({ error: "Erro ao criar ficha." });
    }
});
workoutsRouter.put("/templates/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        const body = req.body;
        await ensureWorkoutTemplatesTable();
        const db = getDb();
        const result = await db.query("UPDATE workout_templates SET name = COALESCE($1, name) WHERE id = $2 RETURNING *", [
            body.name?.trim(),
            id,
        ]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Ficha não encontrada." });
        const t = result.rows[0];
        res.json({ template: { id: t.id, name: t.name, createdAt: t.created_at } });
    }
    catch (e) {
        console.error("Template update error:", e);
        res.status(500).json({ error: "Erro ao atualizar ficha." });
    }
});
workoutsRouter.post("/templates/:id/items", async (req, res) => {
    try {
        const templateId = parseInt(req.params.id, 10);
        if (Number.isNaN(templateId))
            return res.status(400).json({ error: "ID inválido." });
        const body = req.body;
        if (!body.exerciseId)
            return res.status(400).json({ error: "exerciseId é obrigatório." });
        await ensureWorkoutTemplateItemsTable();
        await ensureExercisesTable();
        const db = getDb();
        const maxOrder = await db.query("SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM workout_template_items WHERE template_id = $1", [templateId]);
        const nextOrder = maxOrder.rows[0].next_order;
        const insert = await db.query("INSERT INTO workout_template_items (template_id, exercise_id, sets, reps, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id, template_id, exercise_id, sets, reps, sort_order", [templateId, body.exerciseId, body.sets ?? null, body.reps ?? null, nextOrder]);
        const i = insert.rows[0];
        const ex = await db.query("SELECT name, muscle_group FROM exercises WHERE id = $1", [body.exerciseId]);
        const exRow = ex.rows[0];
        res.status(201).json({
            item: {
                id: i.id,
                exerciseId: i.exercise_id,
                exerciseName: exRow?.name,
                muscleGroup: exRow?.muscle_group,
                sets: i.sets,
                reps: i.reps,
                sortOrder: i.sort_order,
            },
        });
    }
    catch (e) {
        console.error("Template item create error:", e);
        res.status(500).json({ error: "Erro ao adicionar exercício na ficha." });
    }
});
workoutsRouter.delete("/templates/:templateId/items/:itemId", async (req, res) => {
    try {
        const templateId = parseInt(req.params.templateId, 10);
        const itemId = parseInt(req.params.itemId, 10);
        if (Number.isNaN(templateId) || Number.isNaN(itemId))
            return res.status(400).json({ error: "IDs inválidos." });
        await ensureWorkoutTemplateItemsTable();
        const db = getDb();
        const result = await db.query("DELETE FROM workout_template_items WHERE id = $1 AND template_id = $2 RETURNING id", [itemId, templateId]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Item não encontrado." });
        res.status(204).send();
    }
    catch (e) {
        console.error("Template item delete error:", e);
        res.status(500).json({ error: "Erro ao remover exercício." });
    }
});
workoutsRouter.get("/students/:studentId", async (req, res) => {
    try {
        const studentId = parseInt(req.params.studentId, 10);
        if (Number.isNaN(studentId))
            return res.status(400).json({ error: "ID do aluno inválido." });
        await ensureStudentWorkoutsTable();
        await ensureWorkoutTemplatesTable();
        const db = getDb();
        const result = await db.query(`SELECT sw.id, sw.student_id, sw.template_id, sw.assigned_at, wt.name as template_name
       FROM student_workouts sw JOIN workout_templates wt ON wt.id = sw.template_id
       WHERE sw.student_id = $1 ORDER BY sw.assigned_at DESC`, [studentId]);
        const list = result.rows.map((r) => ({
            id: r.id,
            studentId: r.student_id,
            templateId: r.template_id,
            templateName: r.template_name,
            assignedAt: r.assigned_at,
        }));
        res.json({ workouts: list });
    }
    catch (e) {
        console.error("Student workouts error:", e);
        res.status(500).json({ error: "Erro ao listar treinos do aluno." });
    }
});
workoutsRouter.post("/students/:studentId/templates/:templateId", async (req, res) => {
    try {
        const studentId = parseInt(req.params.studentId, 10);
        const templateId = parseInt(req.params.templateId, 10);
        if (Number.isNaN(studentId) || Number.isNaN(templateId))
            return res.status(400).json({ error: "IDs inválidos." });
        await ensureStudentWorkoutsTable();
        await ensureStudentsTable();
        await ensureWorkoutTemplatesTable();
        const db = getDb();
        const student = await db.query("SELECT id FROM students WHERE id = $1", [studentId]);
        if (student.rows.length === 0)
            return res.status(404).json({ error: "Aluno não encontrado." });
        const template = await db.query("SELECT id, name FROM workout_templates WHERE id = $1", [templateId]);
        if (template.rows.length === 0)
            return res.status(404).json({ error: "Ficha não encontrada." });
        const insert = await db.query("INSERT INTO student_workouts (student_id, template_id) VALUES ($1, $2) RETURNING id, student_id, template_id, assigned_at", [studentId, templateId]);
        const r = insert.rows[0];
        const t = template.rows[0];
        res.status(201).json({
            workout: {
                id: r.id,
                studentId: r.student_id,
                templateId: r.template_id,
                templateName: t.name,
                assignedAt: r.assigned_at,
            },
        });
    }
    catch (e) {
        console.error("Assign workout error:", e);
        res.status(500).json({ error: "Erro ao associar ficha ao aluno." });
    }
});
workoutsRouter.delete("/students/:studentId/workouts/:workoutId", async (req, res) => {
    try {
        const studentId = parseInt(req.params.studentId, 10);
        const workoutId = parseInt(req.params.workoutId, 10);
        if (Number.isNaN(studentId) || Number.isNaN(workoutId))
            return res.status(400).json({ error: "IDs inválidos." });
        await ensureStudentWorkoutsTable();
        const db = getDb();
        const result = await db.query("DELETE FROM student_workouts WHERE id = $1 AND student_id = $2 RETURNING id", [workoutId, studentId]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Vínculo não encontrado." });
        res.status(204).send();
    }
    catch (e) {
        console.error("Unassign workout error:", e);
        res.status(500).json({ error: "Erro ao desvincular ficha." });
    }
});
