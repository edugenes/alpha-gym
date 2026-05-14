/**
 * Cria o primeiro usuário administrador se não existir nenhum.
 * Uso: npx tsx src/db/seed.ts
 * Variáveis: ADMIN_EMAIL, ADMIN_PASSWORD (opcional; default admin / admin). Usa SQLite.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { getDb } from "./client.js";
import { ensureUsersTable } from "./schema.js";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin";
async function seed() {
    await ensureUsersTable();
    const db = getDb();
    const existing = await db.query("SELECT id FROM users LIMIT 1");
    if (existing.rows.length > 0) {
        console.log("Já existem usuários. Nenhum seed aplicado.");
        process.exit(0);
        return;
    }
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await db.query("INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)", [ADMIN_EMAIL.toLowerCase(), hash, "Administrador", "administrador"]);
    console.log("Usuário administrador criado:", ADMIN_EMAIL);
    process.exit(0);
}
seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
