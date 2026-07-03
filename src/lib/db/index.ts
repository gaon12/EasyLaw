import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { corpusDatabasePathFor, databasePath } from "../runtime-paths";
import { ensureInstallationState } from "../setup";
import { corpusMigrations, migrations } from "./schema";

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
  attachCorpusDatabase(db, filePath);
  migrateCorpusDatabase(db);
  migrateDatabase(db);
  return db;
}

function attachCorpusDatabase(db: SqliteDatabase, mainPath: string) {
  const corpusPath =
    mainPath === ":memory:" ? ":memory:" : corpusDatabasePathFor(mainPath);
  db.prepare("ATTACH DATABASE ? AS corpus").run(corpusPath);
  if (corpusPath !== ":memory:") {
    db.pragma("corpus.journal_mode = WAL");
  }
}

export function getDatabase() {
  if (!singleton) {
    singleton = createDatabase(databasePath());
    ensureInstallationState(singleton);
  }

  return singleton;
}

export function migrateCorpusDatabase(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS corpus.schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare<[], { id: number }>("SELECT id FROM corpus.schema_migrations")
      .all()
      .map((row) => row.id),
  );

  for (const migration of corpusMigrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO corpus.schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.id, migration.name, new Date().toISOString());
    });
    apply();
  }
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
