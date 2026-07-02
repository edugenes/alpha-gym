import { Router } from "express";
import { randomBytes } from "crypto";
import { getDb } from "../db/client.js";
import { ensureDevicesTable } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
export const devicesRouter = Router();
function rowToDevice(r) {
    return {
        id: r.id,
        name: r.name,
        type: r.type,
        location: r.location,
        token: r.token,
        status: r.status,
        lastSeenAt: r.last_seen_at,
        createdAt: r.created_at,
    };
}
/** GET /api/devices — listar dispositivos (admin) */
devicesRouter.get("/", requireAuth, requireRole("administrador"), async (_req, res) => {
    try {
        await ensureDevicesTable();
        const db = getDb();
        const result = await db.query("SELECT * FROM devices ORDER BY name");
        res.json({ devices: result.rows.map(rowToDevice) });
    }
    catch (e) {
        console.error("Devices list error:", e);
        res.status(500).json({ error: "Erro ao listar dispositivos." });
    }
});
/** POST /api/devices — criar dispositivo (admin) */
devicesRouter.post("/", requireAuth, requireRole("administrador"), async (req, res) => {
    try {
        const { name, type, location } = req.body;
        if (!name?.trim())
            return res.status(400).json({ error: "Nome é obrigatório." });
        const validTypes = ["totem", "catraca", "leitor_digital"];
        if (!type || !validTypes.includes(type)) {
            return res.status(400).json({ error: "Tipo inválido. Use: totem, catraca ou leitor_digital." });
        }
        const token = randomBytes(32).toString("hex");
        await ensureDevicesTable();
        const db = getDb();
        const insert = await db.query("INSERT INTO devices (name, type, location, token) VALUES ($1, $2, $3, $4) RETURNING *", [name.trim(), type, location?.trim() ?? null, token]);
        res.status(201).json({ device: rowToDevice(insert.rows[0]) });
    }
    catch (e) {
        console.error("Device create error:", e);
        res.status(500).json({ error: "Erro ao criar dispositivo." });
    }
});
/** PUT /api/devices/:id — atualizar dispositivo (admin) */
devicesRouter.put("/:id", requireAuth, requireRole("administrador"), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        const { name, location, status } = req.body;
        await ensureDevicesTable();
        const db = getDb();
        const result = await db.query(`UPDATE devices SET
        name = COALESCE($1, name),
        location = COALESCE($2, location),
        status = COALESCE($3, status)
       WHERE id = $4 RETURNING *`, [name?.trim() ?? null, location?.trim() ?? null, status ?? null, id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Dispositivo não encontrado." });
        res.json({ device: rowToDevice(result.rows[0]) });
    }
    catch (e) {
        console.error("Device update error:", e);
        res.status(500).json({ error: "Erro ao atualizar dispositivo." });
    }
});
/** DELETE /api/devices/:id — remover dispositivo (admin) */
devicesRouter.delete("/:id", requireAuth, requireRole("administrador"), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        await ensureDevicesTable();
        const db = getDb();
        const result = await db.query("DELETE FROM devices WHERE id = $1 RETURNING id", [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Dispositivo não encontrado." });
        res.status(204).send();
    }
    catch (e) {
        console.error("Device delete error:", e);
        res.status(500).json({ error: "Erro ao remover dispositivo." });
    }
});
/** POST /api/devices/:id/regenerate-token — gerar novo token (admin) */
devicesRouter.post("/:id/regenerate-token", requireAuth, requireRole("administrador"), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        const newToken = randomBytes(32).toString("hex");
        await ensureDevicesTable();
        const db = getDb();
        const result = await db.query("UPDATE devices SET token = $1 WHERE id = $2 RETURNING *", [newToken, id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Dispositivo não encontrado." });
        res.json({ device: rowToDevice(result.rows[0]) });
    }
    catch (e) {
        console.error("Regenerate token error:", e);
        res.status(500).json({ error: "Erro ao regenerar token." });
    }
});
