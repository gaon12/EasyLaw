import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { auditLog } from "./audit";
import type { SqliteDatabase } from "./db";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  newId,
  newRecoveryCode,
  newUrlToken,
} from "./security/crypto";
import { checkRateLimit } from "./security/rate-limit";
import { addMinutesIso, nowIso } from "./time";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  totp_enabled: number;
  totp_required: number;
  totp_secret_ciphertext: string | null;
};

export function ensureUser(
  db: SqliteDatabase,
  email: string,
  displayName = email.split("@")[0],
) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db
    .prepare<[string], UserRow>("SELECT * FROM users WHERE email = ?")
    .get(normalizedEmail);

  if (existing) {
    return existing;
  }

  const now = nowIso();
  const id = newId("user");
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, role, totp_enabled, totp_required, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, normalizedEmail, displayName, "user", 0, 0, now, now);

  db.prepare(
    `INSERT INTO user_auth_methods
      (id, user_id, kind, identifier, verified_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(newId("auth"), id, "magic_link", normalizedEmail, null, now);

  const created = db
    .prepare<[string], UserRow>("SELECT * FROM users WHERE id = ?")
    .get(id);
  if (!created) {
    throw new Error("Failed to create user");
  }

  return created;
}

export function createMagicLink(db: SqliteDatabase, email: string) {
  const rate = checkRateLimit(
    db,
    `magic-link:${email.trim().toLowerCase()}`,
    5,
    15 * 60_000,
  );
  if (!rate.allowed) {
    return {
      ok: false as const,
      reason: "rate_limited",
      resetAt: rate.resetAt,
    };
  }

  const user = ensureUser(db, email);
  const token = newUrlToken();
  const now = nowIso();
  db.prepare(
    `INSERT INTO magic_links
      (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)`,
  ).run(newId("magic"), user.id, hashToken(token), addMinutesIso(15), now);

  auditLog(db, {
    actorUserId: user.id,
    action: "magic_link.created",
    targetType: "user",
    targetId: user.id,
  });

  return { ok: true as const, userId: user.id, token };
}

export function consumeMagicLink(db: SqliteDatabase, token: string) {
  const row = db
    .prepare<
      [string],
      {
        id: string;
        user_id: string;
        expires_at: string;
        consumed_at: string | null;
      }
    >(
      "SELECT id, user_id, expires_at, consumed_at FROM magic_links WHERE token_hash = ?",
    )
    .get(hashToken(token));

  if (!row || row.consumed_at || new Date(row.expires_at) < new Date()) {
    return { ok: false as const, reason: "invalid_or_expired" };
  }

  const now = nowIso();
  db.prepare("UPDATE magic_links SET consumed_at = ? WHERE id = ?").run(
    now,
    row.id,
  );
  db.prepare(
    `UPDATE user_auth_methods
      SET verified_at = ?
      WHERE user_id = ? AND kind = 'magic_link'`,
  ).run(now, row.user_id);

  const user = db
    .prepare<[string], UserRow>("SELECT * FROM users WHERE id = ?")
    .get(row.user_id);
  if (!user) {
    return { ok: false as const, reason: "invalid_user" };
  }

  auditLog(db, {
    actorUserId: user.id,
    action: "magic_link.consumed",
    targetType: "user",
    targetId: user.id,
  });

  return {
    ok: true as const,
    userId: user.id,
    requiresTotp: user.totp_enabled === 1,
  };
}

export async function createTotpEnrollment(db: SqliteDatabase, userId: string) {
  const user = db
    .prepare<[string], UserRow>("SELECT * FROM users WHERE id = ?")
    .get(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const secret = generateSecret();
  const encrypted = encryptSecret(secret);
  const now = nowIso();
  db.prepare(
    `UPDATE users
      SET totp_secret_ciphertext = ?, updated_at = ?
      WHERE id = ?`,
  ).run(encrypted, now, userId);

  db.prepare(
    `INSERT INTO user_auth_methods
      (id, user_id, kind, identifier, verified_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, kind)
      DO UPDATE SET identifier = excluded.identifier`,
  ).run(newId("auth"), userId, "totp", "totp", null, now);

  const otpauthUrl = generateURI({
    issuer: "EasyLaw",
    label: user.email,
    secret,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  auditLog(db, {
    actorUserId: userId,
    action: "totp.enrollment_created",
    targetType: "user",
    targetId: userId,
  });

  return { otpauthUrl, qrDataUrl };
}

export async function verifyTotpEnrollment(
  db: SqliteDatabase,
  userId: string,
  code: string,
) {
  const rate = checkRateLimit(db, `totp:${userId}`, 8, 10 * 60_000);
  if (!rate.allowed) {
    return { ok: false as const, reason: "rate_limited" };
  }

  const user = db
    .prepare<[string], UserRow>("SELECT * FROM users WHERE id = ?")
    .get(userId);

  if (!user?.totp_secret_ciphertext) {
    return { ok: false as const, reason: "not_enrolled" };
  }

  const secret = decryptSecret(user.totp_secret_ciphertext);
  const result = await verify({ secret, token: code.replace(/\s/g, "") });
  if (!result.valid) {
    auditLog(db, {
      actorUserId: userId,
      action: "totp.verify_failed",
      targetType: "user",
      targetId: userId,
    });
    return { ok: false as const, reason: "invalid_code" };
  }

  const recoveryCodes = replaceRecoveryCodes(db, userId);
  const now = nowIso();
  db.prepare(
    `UPDATE users
      SET totp_enabled = 1, updated_at = ?
      WHERE id = ?`,
  ).run(now, userId);
  db.prepare(
    `UPDATE user_auth_methods
      SET verified_at = ?
      WHERE user_id = ? AND kind = 'totp'`,
  ).run(now, userId);

  auditLog(db, {
    actorUserId: userId,
    action: "totp.enabled",
    targetType: "user",
    targetId: userId,
  });

  return { ok: true as const, recoveryCodes };
}

export function replaceRecoveryCodes(db: SqliteDatabase, userId: string) {
  const codes = Array.from({ length: 10 }, () => newRecoveryCode());
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM user_recovery_codes WHERE user_id = ?").run(userId);
    const insert = db.prepare(
      `INSERT INTO user_recovery_codes
        (id, user_id, code_hash, created_at)
        VALUES (?, ?, ?, ?)`,
    );
    for (const code of codes) {
      insert.run(newId("recovery"), userId, hashToken(code), now);
    }
  });
  tx();
  return codes;
}

export function consumeRecoveryCode(
  db: SqliteDatabase,
  userId: string,
  code: string,
) {
  const rate = checkRateLimit(db, `recovery:${userId}`, 5, 10 * 60_000);
  if (!rate.allowed) {
    return { ok: false as const, reason: "rate_limited" };
  }

  const row = db
    .prepare<[string, string], { id: string; used_at: string | null }>(
      `SELECT id, used_at
        FROM user_recovery_codes
        WHERE user_id = ? AND code_hash = ?`,
    )
    .get(userId, hashToken(code.toUpperCase()));

  if (!row || row.used_at) {
    auditLog(db, {
      actorUserId: userId,
      action: "recovery_code.failed",
      targetType: "user",
      targetId: userId,
    });
    return { ok: false as const, reason: "invalid_code" };
  }

  db.prepare("UPDATE user_recovery_codes SET used_at = ? WHERE id = ?").run(
    nowIso(),
    row.id,
  );
  auditLog(db, {
    actorUserId: userId,
    action: "recovery_code.used",
    targetType: "user",
    targetId: userId,
  });
  return { ok: true as const };
}

export function assertManagementAccess(
  db: SqliteDatabase,
  input: {
    userId: string;
    scope: "admin" | "organization";
    organizationId?: string;
  },
) {
  const user = db
    .prepare<[string], UserRow>("SELECT * FROM users WHERE id = ?")
    .get(input.userId);

  if (!user) {
    return { ok: false as const, reason: "not_found" };
  }

  if (input.scope === "admin" && user.role !== "admin") {
    return { ok: false as const, reason: "not_admin" };
  }

  if (input.scope === "organization") {
    const membership = db
      .prepare<[string, string], { role: string }>(
        `SELECT role
          FROM organization_members
          WHERE organization_id = ? AND user_id = ?`,
      )
      .get(input.organizationId ?? "", input.userId);
    if (!membership) {
      return { ok: false as const, reason: "not_member" };
    }
    if (membership.role === "owner" && user.totp_enabled !== 1) {
      return { ok: false as const, reason: "totp_required" };
    }
  }

  if (
    (user.totp_required === 1 || user.role === "admin") &&
    user.totp_enabled !== 1
  ) {
    return { ok: false as const, reason: "totp_required" };
  }

  return { ok: true as const };
}
