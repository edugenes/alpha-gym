import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
let db = null;
function getDbPath() {
    const dir = process.env.SQLITE_PATH || path.join(process.cwd(), "data");
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "alpha_gym.db");
}
function convertPlaceholders(sql) {
    return sql.replace(/\$(\d+)/g, "?");
}
export function getDb() {
    if (!db) {
        const dbPath = getDbPath();
        db = new Database(dbPath);
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
    }
    return {
        query(sql, params = []) {
            const converted = convertPlaceholders(sql);
            const stmt = db.prepare(converted);
            const upper = converted.trim().toUpperCase();
            const isSelect = upper.startsWith("SELECT") || upper.startsWith("WITH");
            const hasReturning = converted.includes("RETURNING");
            if (isSelect || hasReturning) {
                const rows = params.length ? stmt.all(...params) : stmt.all();
                return Promise.resolve({ rows: rows });
            }
            stmt.run(...params);
            const info = db.prepare("SELECT last_insert_rowid() as id").get();
            const rows = info?.id ? [{ id: info.id, ...stmt }] : [];
            return Promise.resolve({ rows });
        },
        _raw() {
            return db;
        },
    };
}
