import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrations } from "./schema";
import { seedDatabase } from "./seed";

export type SqliteDatabase = Database.Database;

let singleton: SqliteDatabase | null = null;

export function createDatabase(filePath = ":memory:") {
  if (filePath !== ":memory:") {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrateDatabase(db);
  return db;
}

export function getDatabase() {
  if (!singleton) {
    const dbPath =
      process.env.EASYLAW_DB_PATH ??
      path.join(process.cwd(), "data", "easylaw.sqlite");
    singleton = createDatabase(dbPath);
    seedDatabase(singleton);
  }

  return singleton;
}

export function migrateDatabase(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare<[], { id: number }>("SELECT id FROM schema_migrations")
      .all()
      .map((row) => row.id),
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.id, migration.name, new Date().toISOString());
    });
    apply();
  }
}

export function closeDatabase() {
  singleton?.close();
  singleton = null;
}
