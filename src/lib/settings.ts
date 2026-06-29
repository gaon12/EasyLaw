import type { SqliteDatabase } from "./db";
import { decryptSecret, encryptSecret } from "./security/crypto";
import { nowIso } from "./time";

export function setSetting(
  db: SqliteDatabase,
  key: string,
  value: string,
  secret = false,
) {
  db.prepare(
    `INSERT INTO service_settings
      (key, value_ciphertext, is_secret, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_ciphertext = excluded.value_ciphertext,
        is_secret = excluded.is_secret,
        updated_at = excluded.updated_at`,
  ).run(key, encryptSecret(value), secret ? 1 : 0, nowIso());
}

export function getSetting(db: SqliteDatabase, key: string) {
  const row = db
    .prepare<[string], { value_ciphertext: string }>(
      "SELECT value_ciphertext FROM service_settings WHERE key = ?",
    )
    .get(key);
  return row ? decryptSecret(row.value_ciphertext) : null;
}

export function hasSetting(db: SqliteDatabase, key: string) {
  return Boolean(
    db
      .prepare<[string], { present: number }>(
        "SELECT 1 AS present FROM service_settings WHERE key = ?",
      )
      .get(key),
  );
}
