import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let db: Database.Database | null = null;

function getDbPath(): string {
  const dir = process.env.SQLITE_PATH || path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "alpha_gym.db");
}

function convertPlaceholders(sql: string): string {
  return sql.replace(/\$(\d+)/g, "?");
}

export interface QueryResult {
  rows: unknown[];
}

export function getDb(): {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  _raw: () => Database.Database;
} {
  if (!db) {
    const dbPath = getDbPath();
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return {
    query(sql: string, params: unknown[] = []): Promise<QueryResult> {
      const converted = convertPlaceholders(sql);
      const stmt = db!.prepare(converted);
      const upper = converted.trim().toUpperCase();
      const isSelect = upper.startsWith("SELECT") || upper.startsWith("WITH");
      const hasReturning = converted.includes("RETURNING");
      if (isSelect || hasReturning) {
        const rows = params.length ? stmt.all(...params) : stmt.all();
        return Promise.resolve({ rows: rows as unknown[] });
      }
      stmt.run(...params);
      const info = db!.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
      const rows = info?.id ? [{ id: info.id, ...(stmt as unknown as { lastInsertRowid?: number }) }] : [];
      return Promise.resolve({ rows });
    },
    _raw() {
      return db!;
    },
  };
}
