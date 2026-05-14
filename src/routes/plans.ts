import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensurePlansTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export const plansRouter = Router();
plansRouter.use(requireAuth);

type PlanType = "mensal" | "trimestral" | "semestral" | "anual";

interface PlanRow {
  id: number;
  name: string;
  plan_type: string;
  price: string;
  duration_days: number;
  features: string | null;
  is_popular: boolean;
  created_at: string;
  updated_at: string;
}

function rowToPlan(r: PlanRow) {
  return {
    id: r.id,
    name: r.name,
    planType: r.plan_type,
    price: Number(r.price),
    durationDays: r.duration_days,
    features: r.features ? r.features.split("\n").filter(Boolean) : [],
    isPopular: r.is_popular,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

plansRouter.get("/", async (_req, res) => {
  try {
    await ensurePlansTable();
    const db = getDb();
    const result = await db.query("SELECT * FROM plans ORDER BY price");
    res.json({ plans: (result.rows as PlanRow[]).map((r) => rowToPlan(r)) });
  } catch (e) {
    console.error("Plans list error:", e);
    res.status(500).json({ error: "Erro ao listar planos." });
  }
});

plansRouter.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensurePlansTable();
    const db = getDb();
    const result = await db.query("SELECT * FROM plans WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Plano não encontrado." });
    res.json({ plan: rowToPlan(result.rows[0] as PlanRow) });
  } catch (e) {
    console.error("Plan get error:", e);
    res.status(500).json({ error: "Erro ao buscar plano." });
  }
});

const PLAN_TYPES: PlanType[] = ["mensal", "trimestral", "semestral", "anual"];

plansRouter.post("/", async (req, res) => {
  try {
    const body = req.body as { name?: string; planType?: string; price?: number; durationDays?: number; features?: string[]; isPopular?: boolean };
    if (!body.name || body.price == null || body.durationDays == null) {
      return res.status(400).json({ error: "Nome, valor e duração são obrigatórios." });
    }
    const planType = (body.planType || "mensal").toLowerCase() as PlanType;
    if (!PLAN_TYPES.includes(planType)) {
      return res.status(400).json({ error: "Tipo de plano inválido." });
    }
    await ensurePlansTable();
    const db = getDb();
    const featuresStr = Array.isArray(body.features) ? body.features.join("\n") : null;
    const insert = await db.query(
      `INSERT INTO plans (name, plan_type, price, duration_days, features, is_popular)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [body.name.trim(), planType, body.price, body.durationDays, featuresStr, !!body.isPopular]
    );
    res.status(201).json({ plan: rowToPlan(insert.rows[0] as PlanRow) });
  } catch (e) {
    console.error("Plan create error:", e);
    res.status(500).json({ error: "Erro ao cadastrar plano." });
  }
});

plansRouter.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    const body = req.body as { name?: string; planType?: string; price?: number; durationDays?: number; features?: string[]; isPopular?: boolean };
    await ensurePlansTable();
    const db = getDb();
    const existing = await db.query("SELECT * FROM plans WHERE id = $1", [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Plano não encontrado." });
    const row = existing.rows[0] as PlanRow;
    const planType = body.planType ? (body.planType as PlanType) : row.plan_type;
    const featuresStr = body.features !== undefined ? (Array.isArray(body.features) ? body.features.join("\n") : null) : row.features;
    await db.query(
      `UPDATE plans SET name = $1, plan_type = $2, price = $3, duration_days = $4, features = $5, is_popular = $6, updated_at = datetime('now') WHERE id = $7`,
      [body.name ?? row.name, planType, body.price ?? Number(row.price), body.durationDays ?? row.duration_days, featuresStr, body.isPopular ?? row.is_popular, id]
    );
    const updated = await db.query("SELECT * FROM plans WHERE id = $1", [id]);
    res.json({ plan: rowToPlan(updated.rows[0] as PlanRow) });
  } catch (e) {
    console.error("Plan update error:", e);
    res.status(500).json({ error: "Erro ao atualizar plano." });
  }
});

plansRouter.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensurePlansTable();
    const db = getDb();
    const result = await db.query("DELETE FROM plans WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Plano não encontrado." });
    res.status(204).send();
  } catch (e) {
    console.error("Plan delete error:", e);
    res.status(500).json({ error: "Erro ao excluir plano." });
  }
});
