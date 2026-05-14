import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensureExercisesTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export const exercisesRouter = Router();
exercisesRouter.use(requireAuth);

interface ExerciseRow {
  id: number;
  name: string;
  muscle_group: string;
  video_url: string | null;
  created_at: string;
}

function rowToExercise(r: ExerciseRow) {
  return {
    id: r.id,
    name: r.name,
    muscleGroup: r.muscle_group,
    videoUrl: r.video_url,
    createdAt: r.created_at,
  };
}

exercisesRouter.get("/", async (req, res) => {
  try {
    await ensureExercisesTable();
    const db = getDb();
    const muscle = req.query.muscle_group as string | undefined;
    let query = "SELECT * FROM exercises ORDER BY muscle_group, name";
    const params: string[] = [];
    if (muscle?.trim()) {
      params.push(muscle.trim());
      query = "SELECT * FROM exercises WHERE muscle_group = $1 ORDER BY name";
    }
    const result = await db.query(query, params);
    res.json({ exercises: (result.rows as ExerciseRow[]).map((r) => rowToExercise(r)) });
  } catch (e) {
    console.error("Exercises list error:", e);
    res.status(500).json({ error: "Erro ao listar exercícios." });
  }
});

exercisesRouter.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensureExercisesTable();
    const db = getDb();
    const result = await db.query("SELECT * FROM exercises WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Exercício não encontrado." });
    res.json({ exercise: rowToExercise(result.rows[0] as ExerciseRow) });
  } catch (e) {
    console.error("Exercise get error:", e);
    res.status(500).json({ error: "Erro ao buscar exercício." });
  }
});

exercisesRouter.post("/", async (req, res) => {
  try {
    const body = req.body as { name: string; muscleGroup: string; videoUrl?: string };
    if (!body.name?.trim() || !body.muscleGroup?.trim()) {
      return res.status(400).json({ error: "Nome e grupo muscular são obrigatórios." });
    }
    await ensureExercisesTable();
    const db = getDb();
    const insert = await db.query(
      "INSERT INTO exercises (name, muscle_group, video_url) VALUES ($1, $2, $3) RETURNING *",
      [body.name.trim(), body.muscleGroup.trim(), body.videoUrl?.trim() || null]
    );
    res.status(201).json({ exercise: rowToExercise(insert.rows[0] as ExerciseRow) });
  } catch (e) {
    console.error("Exercise create error:", e);
    res.status(500).json({ error: "Erro ao cadastrar exercício." });
  }
});

exercisesRouter.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    const body = req.body as { name?: string; muscleGroup?: string; videoUrl?: string };
    await ensureExercisesTable();
    const db = getDb();
    const result = await db.query(
      "UPDATE exercises SET name = COALESCE($1, name), muscle_group = COALESCE($2, muscle_group), video_url = $3 WHERE id = $4 RETURNING *",
      [body.name?.trim(), body.muscleGroup?.trim(), body.videoUrl?.trim() ?? null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Exercício não encontrado." });
    res.json({ exercise: rowToExercise(result.rows[0] as ExerciseRow) });
  } catch (e) {
    console.error("Exercise update error:", e);
    res.status(500).json({ error: "Erro ao atualizar exercício." });
  }
});

exercisesRouter.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensureExercisesTable();
    const db = getDb();
    const result = await db.query("DELETE FROM exercises WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Exercício não encontrado." });
    res.status(204).send();
  } catch (e) {
    console.error("Exercise delete error:", e);
    res.status(500).json({ error: "Erro ao excluir exercício." });
  }
});
