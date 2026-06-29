import type { SqliteDatabase } from "./db";
import { hashToken, newId, newUrlToken } from "./security/crypto";
import { nowIso } from "./time";

export const SESSION_COOKIE = "easylaw_session";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  totpEnabled: boolean;
};

export function createUserSession(db: SqliteDatabase, userId: string) {
  const token = newUrlToken();
  const expiresAt = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  db.prepare(
    `INSERT INTO user_sessions
      (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)`,
  ).run(newId("session"), userId, hashToken(token), expiresAt, nowIso());
  return { token, expiresAt };
}

export function getSessionUser(
  db: SqliteDatabase,
  token: string | undefined,
): SessionUser | null {
  if (!token) {
    return null;
  }

  const row = db
    .prepare<
      [string, string],
      {
        id: string;
        email: string;
        display_name: string;
        role: string;
        totp_enabled: number;
      }
    >(
      `SELECT users.id, users.email, users.display_name, users.role,
        users.totp_enabled
      FROM user_sessions
      JOIN users ON users.id = user_sessions.user_id
      WHERE user_sessions.token_hash = ?
        AND user_sessions.revoked_at IS NULL
        AND user_sessions.expires_at > ?`,
    )
    .get(hashToken(token), nowIso());

  return row
    ? {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        totpEnabled: row.totp_enabled === 1,
      }
    : null;
}
