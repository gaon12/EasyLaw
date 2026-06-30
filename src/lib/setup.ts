import { randomBytes } from "node:crypto";
import { Resend } from "resend";
import { auditLog } from "./audit";
import { createTotpEnrollment, verifyTotpEnrollment } from "./auth";
import type { SqliteDatabase } from "./db";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  newId,
  newNumericCode,
  newUrlToken,
} from "./security/crypto";
import { checkRateLimit } from "./security/rate-limit";
import { createUserSession } from "./session";
import { getSetting, setSetting } from "./settings";
import { addMinutesIso, nowIso } from "./time";

export const SETUP_COOKIE = "easylaw_setup";

export type InstallationStatus =
  | "pending"
  | "email_pending"
  | "totp_pending"
  | "complete";

type InstallationRow = {
  status: InstallationStatus;
  setup_code_hash: string | null;
  setup_code_ciphertext: string | null;
  setup_code_expires_at: string | null;
  setup_session_hash: string | null;
  setup_session_expires_at: string | null;
  email_code_hash: string | null;
  email_code_expires_at: string | null;
  email_test_fingerprint: string | null;
  email_tested_at: string | null;
  admin_user_id: string | null;
  completed_at: string | null;
};

const loggedSetupCodes = new Set<string>();

function installationRow(db: SqliteDatabase) {
  return db
    .prepare<[], InstallationRow>(
      "SELECT * FROM installation_state WHERE id = 1",
    )
    .get();
}

function createSetupCode() {
  if (
    process.env.EASYLAW_TEST_MODE === "1" &&
    process.env.EASYLAW_TEST_SETUP_CODE
  ) {
    return process.env.EASYLAW_TEST_SETUP_CODE;
  }

  const raw = randomBytes(9).toString("base64url").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function logSetupCode(code: string) {
  const fingerprint = hashToken(code);
  if (loggedSetupCodes.has(fingerprint)) {
    return;
  }
  loggedSetupCodes.add(fingerprint);
  console.info(
    `\n[EasyLaw] First-run setup is required.\n[EasyLaw] Open /setup and enter: ${code}\n`,
  );
}

export function ensureInstallationState(db: SqliteDatabase) {
  let state = installationRow(db);
  if (!state) {
    const code = createSetupCode();
    const now = nowIso();
    db.prepare(
      `INSERT INTO installation_state
        (id, status, setup_code_hash, setup_code_ciphertext,
         setup_code_expires_at, created_at, updated_at)
        VALUES (1, 'pending', ?, ?, ?, ?, ?)`,
    ).run(hashToken(code), encryptSecret(code), addMinutesIso(60), now, now);
    state = installationRow(db);
  }

  if (
    state?.status !== "complete" &&
    state?.setup_code_ciphertext &&
    state.setup_code_expires_at
  ) {
    if (new Date(state.setup_code_expires_at) <= new Date()) {
      const code = createSetupCode();
      db.prepare(
        `UPDATE installation_state
          SET setup_code_hash = ?, setup_code_ciphertext = ?,
              setup_code_expires_at = ?, updated_at = ?
          WHERE id = 1`,
      ).run(hashToken(code), encryptSecret(code), addMinutesIso(60), nowIso());
      logSetupCode(code);
    } else {
      logSetupCode(decryptSecret(state.setup_code_ciphertext));
    }
  }
}

export function isInstallationComplete(db: SqliteDatabase) {
  return installationRow(db)?.status === "complete";
}

export function getSetupStatus(db: SqliteDatabase, sessionToken?: string) {
  const state = installationRow(db);
  return {
    status: state?.status ?? "pending",
    sessionAuthenticated: isSetupSessionValid(db, sessionToken),
  };
}

export function unlockSetup(db: SqliteDatabase, code: string, rateKey: string) {
  ensureInstallationState(db);
  const rate = checkRateLimit(db, `setup-code:${rateKey}`, 5, 15 * 60_000);
  if (!rate.allowed) {
    return { ok: false as const, reason: "rate_limited" };
  }

  const state = installationRow(db);
  if (
    !state ||
    state.status === "complete" ||
    !state.setup_code_hash ||
    !state.setup_code_expires_at ||
    new Date(state.setup_code_expires_at) <= new Date() ||
    hashToken(code.trim().toUpperCase()) !== state.setup_code_hash
  ) {
    auditLog(db, {
      action: "setup.unlock_failed",
      targetType: "installation",
    });
    return { ok: false as const, reason: "invalid_code" };
  }

  const sessionToken = newUrlToken();
  const expiresAt = addMinutesIso(30);
  db.prepare(
    `UPDATE installation_state
      SET setup_session_hash = ?, setup_session_expires_at = ?, updated_at = ?
      WHERE id = 1`,
  ).run(hashToken(sessionToken), expiresAt, nowIso());
  auditLog(db, {
    action: "setup.unlocked",
    targetType: "installation",
  });

  return {
    ok: true as const,
    sessionToken,
    expiresAt,
    status: state.status,
  };
}

export function isSetupSessionValid(db: SqliteDatabase, sessionToken?: string) {
  if (!sessionToken) {
    return false;
  }
  const state = installationRow(db);
  return Boolean(
    state?.status !== "complete" &&
      state?.setup_session_hash &&
      state.setup_session_expires_at &&
      new Date(state.setup_session_expires_at) > new Date() &&
      hashToken(sessionToken) === state.setup_session_hash,
  );
}

export async function configureSetup(
  db: SqliteDatabase,
  sessionToken: string | undefined,
  input: {
    serviceName: string;
    adminName: string;
    adminEmail: string;
    resendApiKey: string;
    fromName: string;
    fromAddress: string;
    skipApiTest?: boolean;
  },
) {
  if (!isSetupSessionValid(db, sessionToken)) {
    return { ok: false as const, reason: "unauthorized" };
  }

  const state = installationRow(db);
  if (!state || !["pending", "email_pending"].includes(state.status)) {
    return { ok: false as const, reason: "invalid_state" };
  }
  const hasValidEmailTest =
    state.email_test_fingerprint &&
    state.email_tested_at &&
    Date.now() - new Date(state.email_tested_at).getTime() <= 15 * 60_000 &&
    state.email_test_fingerprint === emailConfigurationFingerprint(input);
  if (!input.skipApiTest && !hasValidEmailTest) {
    return { ok: false as const, reason: "api_test_required" };
  }

  const email = input.adminEmail.trim().toLowerCase();
  const now = nowIso();
  let adminUserId = state.admin_user_id;

  const save = db.transaction(() => {
    if (!adminUserId) {
      const userCount = db
        .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM users")
        .get()?.count;
      if (userCount !== 0) {
        throw new Error("Setup requires an empty user table");
      }
      adminUserId = newId("user");
      db.prepare(
        `INSERT INTO users
          (id, email, display_name, role, totp_enabled, totp_required,
           created_at, updated_at)
          VALUES (?, ?, ?, 'super_admin', 0, 1, ?, ?)`,
      ).run(adminUserId, email, input.adminName.trim(), now, now);
      db.prepare(
        `INSERT INTO user_auth_methods
          (id, user_id, kind, identifier, verified_at, created_at)
          VALUES (?, ?, 'email', ?, NULL, ?)`,
      ).run(newId("auth"), adminUserId, email, now);
    } else {
      db.prepare(
        `UPDATE users
          SET email = ?, display_name = ?, updated_at = ?
          WHERE id = ?`,
      ).run(email, input.adminName.trim(), now, adminUserId);
      db.prepare(
        `UPDATE user_auth_methods
          SET identifier = ?, verified_at = NULL
          WHERE user_id = ? AND kind = 'email'`,
      ).run(email, adminUserId);
    }

    setSetting(db, "service_name", input.serviceName.trim());
    setSetting(db, "resend_api_key", input.resendApiKey.trim(), true);
    setSetting(db, "email_from_name", input.fromName.trim());
    setSetting(
      db,
      "email_from_address",
      input.fromAddress.trim().toLowerCase(),
    );

    const emailCode =
      process.env.EASYLAW_TEST_MODE === "1" &&
      process.env.EASYLAW_TEST_EMAIL_CODE
        ? process.env.EASYLAW_TEST_EMAIL_CODE
        : newNumericCode();
    db.prepare(
      `UPDATE installation_state
        SET status = 'email_pending', admin_user_id = ?,
            email_code_hash = ?, email_code_expires_at = ?,
            updated_at = ?
        WHERE id = 1`,
    ).run(adminUserId, hashToken(emailCode), addMinutesIso(10), now);
    return emailCode;
  });

  const emailCode = save();
  await sendSetupVerificationEmail(db, email, emailCode);
  auditLog(db, {
    actorUserId: adminUserId,
    action: input.skipApiTest ? "setup.email_test_skipped" : "setup.email_sent",
    targetType: "installation",
  });
  return { ok: true as const };
}

type EmailConfiguration = {
  adminEmail: string;
  resendApiKey: string;
  fromName: string;
  fromAddress: string;
};

function emailConfigurationFingerprint(input: EmailConfiguration) {
  return hashToken(
    JSON.stringify({
      adminEmail: input.adminEmail.trim().toLowerCase(),
      resendApiKey: input.resendApiKey.trim(),
      fromName: input.fromName.trim(),
      fromAddress: input.fromAddress.trim().toLowerCase(),
    }),
  );
}

function formatSender(name: string, address: string) {
  return `${name.trim()} <${address.trim().toLowerCase()}>`;
}

export async function testSetupEmailConfiguration(
  db: SqliteDatabase,
  sessionToken: string | undefined,
  input: EmailConfiguration,
) {
  if (!isSetupSessionValid(db, sessionToken)) {
    return { ok: false as const, reason: "unauthorized" };
  }
  const state = installationRow(db);
  if (!state || !["pending", "email_pending"].includes(state.status)) {
    return { ok: false as const, reason: "invalid_state" };
  }

  const rate = checkRateLimit(db, "setup-email-test", 5, 15 * 60_000);
  if (!rate.allowed) {
    return { ok: false as const, reason: "rate_limited" };
  }

  if (process.env.EASYLAW_TEST_MODE !== "1") {
    const resend = new Resend(input.resendApiKey.trim());
    const result = await resend.emails.send({
      from: formatSender(input.fromName, input.fromAddress),
      to: input.adminEmail.trim().toLowerCase(),
      subject: "[EasyLaw] 이메일 발송 테스트",
      text: "EasyLaw가 이 주소로 이메일을 보낼 수 있습니다. 설치 화면으로 돌아가 계속 진행해 주세요.",
    });
    if (result.error) {
      return { ok: false as const, reason: "email_test_failed" };
    }
  }

  db.prepare(
    `UPDATE installation_state
      SET email_test_fingerprint = ?, email_tested_at = ?, updated_at = ?
      WHERE id = 1`,
  ).run(emailConfigurationFingerprint(input), nowIso(), nowIso());
  auditLog(db, {
    action: "setup.email_delivery_tested",
    targetType: "installation",
  });
  return { ok: true as const };
}

async function sendSetupVerificationEmail(
  db: SqliteDatabase,
  email: string,
  code: string,
) {
  if (process.env.EASYLAW_TEST_MODE === "1") {
    return;
  }

  const apiKey = getSetting(db, "resend_api_key");
  const fromName = getSetting(db, "email_from_name");
  const fromAddress = getSetting(db, "email_from_address");
  const serviceName = getSetting(db, "service_name") ?? "EasyLaw";
  if (!apiKey || !fromName || !fromAddress) {
    throw new Error("Email delivery is not configured");
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: formatSender(fromName, fromAddress),
    to: email,
    subject: `[${serviceName}] 최고 관리자 이메일 확인`,
    text: `설치를 계속하려면 확인 코드 ${code}를 입력하세요. 이 코드는 10분 동안 유효합니다.`,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function resendSetupEmail(
  db: SqliteDatabase,
  sessionToken: string | undefined,
) {
  if (!isSetupSessionValid(db, sessionToken)) {
    return { ok: false as const, reason: "unauthorized" };
  }
  const state = installationRow(db);
  if (state?.status !== "email_pending" || !state.admin_user_id) {
    return { ok: false as const, reason: "invalid_state" };
  }

  const rate = checkRateLimit(db, "setup-email-resend", 3, 10 * 60_000);
  if (!rate.allowed) {
    return { ok: false as const, reason: "rate_limited" };
  }

  const user = db
    .prepare<[string], { email: string }>(
      "SELECT email FROM users WHERE id = ?",
    )
    .get(state.admin_user_id);
  if (!user) {
    return { ok: false as const, reason: "invalid_state" };
  }

  const code =
    process.env.EASYLAW_TEST_MODE === "1" && process.env.EASYLAW_TEST_EMAIL_CODE
      ? process.env.EASYLAW_TEST_EMAIL_CODE
      : newNumericCode();
  db.prepare(
    `UPDATE installation_state
      SET email_code_hash = ?, email_code_expires_at = ?, updated_at = ?
      WHERE id = 1`,
  ).run(hashToken(code), addMinutesIso(10), nowIso());
  await sendSetupVerificationEmail(db, user.email, code);
  return { ok: true as const };
}

export async function verifySetupEmail(
  db: SqliteDatabase,
  sessionToken: string | undefined,
  code: string,
) {
  if (!isSetupSessionValid(db, sessionToken)) {
    return { ok: false as const, reason: "unauthorized" };
  }

  const state = installationRow(db);
  if (
    state?.status !== "email_pending" ||
    !state.admin_user_id ||
    !state.email_code_hash ||
    !state.email_code_expires_at
  ) {
    return { ok: false as const, reason: "invalid_state" };
  }

  const rate = checkRateLimit(db, "setup-email-verify", 8, 10 * 60_000);
  if (!rate.allowed) {
    return { ok: false as const, reason: "rate_limited" };
  }
  if (
    new Date(state.email_code_expires_at) <= new Date() ||
    hashToken(code.replace(/\s/g, "")) !== state.email_code_hash
  ) {
    auditLog(db, {
      actorUserId: state.admin_user_id,
      action: "setup.email_verify_failed",
      targetType: "installation",
    });
    return { ok: false as const, reason: "invalid_code" };
  }

  const now = nowIso();
  db.prepare(
    `UPDATE user_auth_methods
      SET verified_at = ?
      WHERE user_id = ? AND kind = 'email'`,
  ).run(now, state.admin_user_id);
  db.prepare(
    `UPDATE installation_state
      SET status = 'totp_pending', email_code_hash = NULL,
          email_code_expires_at = NULL, updated_at = ?
      WHERE id = 1`,
  ).run(now);
  const enrollment = await createTotpEnrollment(db, state.admin_user_id);
  return { ok: true as const, enrollment };
}

export async function getOrCreateSetupEnrollment(
  db: SqliteDatabase,
  sessionToken: string | undefined,
) {
  if (!isSetupSessionValid(db, sessionToken)) {
    return { ok: false as const, reason: "unauthorized" };
  }
  const state = installationRow(db);
  if (state?.status !== "totp_pending" || !state.admin_user_id) {
    return { ok: false as const, reason: "invalid_state" };
  }
  const enrollment = await createTotpEnrollment(db, state.admin_user_id);
  return { ok: true as const, enrollment };
}

export async function completeSetup(
  db: SqliteDatabase,
  sessionToken: string | undefined,
  code: string,
) {
  if (!isSetupSessionValid(db, sessionToken)) {
    return { ok: false as const, reason: "unauthorized" };
  }
  const state = installationRow(db);
  if (state?.status !== "totp_pending" || !state.admin_user_id) {
    return { ok: false as const, reason: "invalid_state" };
  }

  const verified = await verifyTotpEnrollment(db, state.admin_user_id, code);
  if (!verified.ok) {
    return verified;
  }

  const now = nowIso();
  db.prepare(
    `UPDATE installation_state
      SET status = 'complete', completed_at = ?,
          setup_session_hash = NULL, setup_session_expires_at = NULL,
          setup_code_hash = NULL, setup_code_ciphertext = NULL,
          setup_code_expires_at = NULL,
          updated_at = ?
      WHERE id = 1`,
  ).run(now, now);
  auditLog(db, {
    actorUserId: state.admin_user_id,
    action: "setup.completed",
    targetType: "installation",
  });
  const session = createUserSession(db, state.admin_user_id);
  return {
    ok: true as const,
    recoveryCodes: verified.recoveryCodes,
    session,
  };
}
