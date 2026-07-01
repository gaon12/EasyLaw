import { verify } from "otplib";
import { auditLog } from "./audit";
import type { SqliteDatabase } from "./db";
import {
  decryptSecret,
  hashToken,
  newId,
  newUrlToken,
} from "./security/crypto";
import { checkRateLimit } from "./security/rate-limit";
import { createUserSession } from "./session";
import { addMinutesIso, nowIso } from "./time";

export const LOGIN_CHALLENGE_COOKIE = "easylaw_login_challenge";

export function createLoginChallenge(db: SqliteDatabase, userId: string) {
  const token = newUrlToken();
  const now = nowIso();
  const expiresAt = addMinutesIso(10);
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE login_challenges
        SET consumed_at = ?
        WHERE user_id = ? AND consumed_at IS NULL`,
    ).run(now, userId);
    db.prepare(
      `INSERT INTO login_challenges
        (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)`,
    ).run(newId("login_challenge"), userId, hashToken(token), expiresAt, now);
  });
  tx();

  auditLog(db, {
    actorUserId: userId,
    action: "login.totp_challenge_created",
    targetType: "user",
    targetId: userId,
  });
  return { expiresAt, token };
}

export async function completeLoginChallenge(
  db: SqliteDatabase,
  token: string | undefined,
  code: string,
) {
  if (!token) {
    return { ok: false as const, reason: "invalid_challenge" };
  }

  const challenge = db
    .prepare<
      [string, string],
      {
        id: string;
        user_id: string;
        totp_enabled: number;
        totp_secret_ciphertext: string | null;
      }
    >(
      `SELECT login_challenges.id, login_challenges.user_id,
        users.totp_enabled, users.totp_secret_ciphertext
      FROM login_challenges
      JOIN users ON users.id = login_challenges.user_id
      WHERE login_challenges.token_hash = ?
        AND login_challenges.consumed_at IS NULL
        AND login_challenges.expires_at > ?`,
    )
    .get(hashToken(token), nowIso());
  if (!challenge) {
    return { ok: false as const, reason: "invalid_challenge" };
  }

  const rate = checkRateLimit(db, `login-totp:${challenge.id}`, 8, 10 * 60_000);
  if (!rate.allowed) {
    return { ok: false as const, reason: "rate_limited" };
  }
  if (challenge.totp_enabled !== 1 || !challenge.totp_secret_ciphertext) {
    return { ok: false as const, reason: "totp_not_enrolled" };
  }

  const result = await verify({
    secret: decryptSecret(challenge.totp_secret_ciphertext),
    token: code.replace(/\s/g, ""),
  });
  if (!result.valid) {
    auditLog(db, {
      actorUserId: challenge.user_id,
      action: "login.totp_failed",
      targetType: "user",
      targetId: challenge.user_id,
    });
    return { ok: false as const, reason: "invalid_code" };
  }

  const createSession = db.transaction(() => {
    const consumed = db
      .prepare(
        `UPDATE login_challenges
          SET consumed_at = ?
          WHERE id = ? AND consumed_at IS NULL`,
      )
      .run(nowIso(), challenge.id);
    if (consumed.changes !== 1) {
      return null;
    }
    return createUserSession(db, challenge.user_id);
  });
  const session = createSession();
  if (!session) {
    return { ok: false as const, reason: "invalid_challenge" };
  }

  auditLog(db, {
    actorUserId: challenge.user_id,
    action: "login.totp_verified",
    targetType: "user",
    targetId: challenge.user_id,
  });
  return { ok: true as const, session };
}
