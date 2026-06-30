import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sha, solveChallenge } from "altcha/lib";
import { NextRequest } from "next/server";
import { generate } from "otplib";
import {
  assertManagementAccess,
  consumeRecoveryCode,
  createTotpEnrollment,
  verifyTotpEnrollment,
} from "../src/lib/auth";
import { createAltchaChallenge, verifyAltchaPayload } from "../src/lib/captcha";
import { createDatabase } from "../src/lib/db";
import { seedDatabase } from "../src/lib/db/seed";
import {
  mergeExternalFirst,
  syncSampleExternalCatalog,
} from "../src/lib/external-law";
import {
  completeGenerationJob,
  createOrAttachGenerationJob,
} from "../src/lib/jobs";
import { buildResearchPlan } from "../src/lib/legal-research";
import { sendReadyNotifications } from "../src/lib/notifications";
import { getPublicJudgments } from "../src/lib/queries";
import { checkAnonymousAccess } from "../src/lib/security/anonymous-access";
import { decryptSecret } from "../src/lib/security/crypto";
import { getSessionUser } from "../src/lib/session";
import {
  completeSetup,
  configureSetup,
  ensureInstallationState,
  isInstallationComplete,
  testSetupEmailConfiguration,
  unlockSetup,
  verifySetupEmail,
} from "../src/lib/setup";

const testDataDir = mkdtempSync(path.join(tmpdir(), "easylaw-keys-"));
process.env.EASYLAW_TEST_MODE = "1";
process.env.EASYLAW_TEST_DATA_DIR = testDataDir;
process.env.EASYLAW_TEST_SETUP_CODE = "TEST-SETUP-01";
process.env.EASYLAW_TEST_EMAIL_CODE = "123456";

function withDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "easylaw-test-"));
  const file = path.join(dir, "test.sqlite");
  const db = createDatabase(file);
  return {
    db,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("first-run setup creates the verified service super administrator", async () => {
  const { db, cleanup } = withDb();
  try {
    const journalMode = db.pragma("journal_mode", { simple: true });
    assert.equal(String(journalMode).toLowerCase(), "wal");
    assert.equal(
      db
        .prepare<[], { count: number }>("SELECT COUNT(*) count FROM users")
        .get()?.count,
      0,
    );

    ensureInstallationState(db);
    const unlocked = unlockSetup(db, "TEST-SETUP-01", "test-client");
    assert.equal(unlocked.ok, true);
    assert.ok(unlocked.ok);

    const setupInput = {
      serviceName: "EasyLaw Test",
      adminName: "최고 관리자",
      adminEmail: "first@example.com",
      resendApiKey: "re_test_key",
      fromName: "EasyLaw",
      fromAddress: "hello@example.com",
    };
    const blockedBeforeTest = await configureSetup(
      db,
      unlocked.sessionToken,
      setupInput,
    );
    assert.deepEqual(blockedBeforeTest, {
      ok: false,
      reason: "api_test_required",
    });

    const emailTest = await testSetupEmailConfiguration(
      db,
      unlocked.sessionToken,
      setupInput,
    );
    assert.equal(emailTest.ok, true);

    const configured = await configureSetup(
      db,
      unlocked.sessionToken,
      setupInput,
    );
    assert.equal(configured.ok, true);

    const emailVerified = await verifySetupEmail(
      db,
      unlocked.sessionToken,
      "123456",
    );
    assert.equal(emailVerified.ok, true);
    assert.ok(emailVerified.ok);

    const secret = new URL(
      emailVerified.enrollment.otpauthUrl,
    ).searchParams.get("secret");
    assert.ok(secret);
    const authCode = await generate({ secret });
    const completed = await completeSetup(db, unlocked.sessionToken, authCode);
    assert.equal(completed.ok, true);
    assert.ok(completed.ok);
    assert.equal(isInstallationComplete(db), true);
    assert.equal(
      getSessionUser(db, completed.session.token)?.role,
      "super_admin",
    );

    const admin = db
      .prepare<
        [string],
        {
          role: string;
          totp_enabled: number;
          totp_required: number;
          verified_at: string | null;
        }
      >(
        `SELECT users.role, users.totp_enabled, users.totp_required,
          user_auth_methods.verified_at
        FROM users
        JOIN user_auth_methods ON user_auth_methods.user_id = users.id
          AND user_auth_methods.kind = 'email'
        WHERE users.email = ?`,
      )
      .get("first@example.com");
    assert.deepEqual(
      {
        role: admin?.role,
        totpEnabled: admin?.totp_enabled,
        totpRequired: admin?.totp_required,
        emailVerified: Boolean(admin?.verified_at),
      },
      {
        role: "super_admin",
        totpEnabled: 1,
        totpRequired: 1,
        emailVerified: true,
      },
    );

    const storedSecret = db
      .prepare<[string], { value_ciphertext: string }>(
        "SELECT value_ciphertext FROM service_settings WHERE key = ?",
      )
      .get("resend_api_key");
    assert.ok(storedSecret);
    assert.equal(storedSecret.value_ciphertext.includes("re_test_key"), false);
  } finally {
    cleanup();
  }
});

test("first-run setup can explicitly skip the Resend API test", async () => {
  const { db, cleanup } = withDb();
  try {
    ensureInstallationState(db);
    const unlocked = unlockSetup(db, "TEST-SETUP-01", "skip-test-client");
    assert.ok(unlocked.ok);

    const configured = await configureSetup(db, unlocked.sessionToken, {
      serviceName: "EasyLaw Test",
      adminName: "최고 관리자",
      adminEmail: "skip@example.com",
      resendApiKey: "re_test_key",
      fromName: "EasyLaw",
      fromAddress: "hello@example.com",
      skipApiTest: true,
    });

    assert.equal(configured.ok, true);
  } finally {
    cleanup();
  }
});

test("external catalog creates public pending judgments", async () => {
  const { db, cleanup } = withDb();
  try {
    await syncSampleExternalCatalog(db);
    const judgments = getPublicJudgments(db);
    assert.ok(judgments.length >= 3);
    assert.equal(judgments[0].visibility, "public");
    assert.ok(
      judgments.every((item) => item.sourceProvider === "korean-law-mcp"),
    );
  } finally {
    cleanup();
  }
});

test("generation jobs dedupe and notification sending is idempotent", async () => {
  const { db, cleanup } = withDb();
  try {
    await syncSampleExternalCatalog(db);
    const judgment = getPublicJudgments(db)[0];
    const firstJobId = createOrAttachGenerationJob(
      db,
      judgment.id,
      "reader@example.com",
    );
    const secondJobId = createOrAttachGenerationJob(
      db,
      judgment.id,
      "reader@example.com",
    );
    assert.equal(firstJobId, secondJobId);

    let sentCount = 0;
    await completeGenerationJob(db, firstJobId);
    const sentAgain = await sendReadyNotifications(db, firstJobId, {
      async send() {
        sentCount += 1;
      },
    });
    assert.equal(sentAgain, 0);
    assert.equal(sentCount, 0);
    const notification = db
      .prepare<[], { status: string }>(
        "SELECT status FROM notifications LIMIT 1",
      )
      .get();
    assert.equal(notification?.status, "sent");
  } finally {
    cleanup();
  }
});

test("external values win over generated metadata conflicts", () => {
  const { merged, conflicts } = mergeExternalFirst(
    { caseNumber: "2023구합54112", courtName: "서울행정법원" },
    { caseNumber: "AI-다른번호", courtName: "서울행정법원" },
  );

  assert.equal(merged.caseNumber, "2023구합54112");
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].field, "caseNumber");
});

test("legal research harness assigns coverage and evidence", () => {
  const { db, cleanup } = withDb();
  try {
    const plan = buildResearchPlan(
      db,
      "중고나라에서 물건값을 입금했는데 판매자가 잠적했습니다. 돈은 찾을 수 있나요?",
    );

    assert.equal(plan.coverageLevel, 2);
    assert.equal(plan.intent, "피해 회복과 민사 청구 가능성 확인");
    assert.ok(plan.evidence.some((item) => item.source === "Case Law API"));
    assert.match(plan.answer, /하네스 미리보기/);
  } finally {
    cleanup();
  }
});

test("anonymous usage limits survive cookie resets on the same network signal", () => {
  const { db, cleanup } = withDb();
  try {
    const makeRequest = () =>
      new NextRequest("http://easylaw.local/api/research/stream", {
        headers: {
          "accept-language": "ko-KR",
          "user-agent": "anonymous-browser",
          "x-easylaw-screen": "1440x900:1",
          "x-easylaw-timezone": "Asia/Seoul",
          "x-forwarded-for": "203.0.113.10",
        },
        method: "POST",
      });

    for (let index = 0; index < 5; index += 1) {
      const result = checkAnonymousAccess(db, makeRequest(), {
        scope: "legal_research",
      });
      assert.equal(result.allowed, true);
      if (result.allowed) {
        result.release();
      }
      db.prepare(
        "UPDATE rate_limits SET window_start = ? WHERE key LIKE ?",
      ).run("2000-01-01T00:00:00.000Z", "legal_research:minute:%");
    }

    const blocked = checkAnonymousAccess(db, makeRequest(), {
      scope: "legal_research",
    });
    assert.equal(blocked.allowed, false);
    assert.equal(
      blocked.allowed ? "" : blocked.error,
      "anonymous_limit_exceeded",
    );
  } finally {
    cleanup();
  }
});

test("ALTCHA payloads verify against the service captcha secret", async () => {
  const { db, cleanup } = withDb();
  try {
    const challenge = await createAltchaChallenge(db);
    assert.ok(challenge);
    const solution = await solveChallenge({
      challenge,
      deriveKey: sha.deriveKey,
      timeout: 10_000,
    });
    const payload = Buffer.from(
      JSON.stringify({ challenge, solution }),
      "utf8",
    ).toString("base64");

    assert.equal(await verifyAltchaPayload(db, payload), true);
    assert.equal(await verifyAltchaPayload(db, "not-valid-base64"), false);
  } finally {
    cleanup();
  }
});

test("TOTP enrollment, recovery code, and management access policy", async () => {
  const { db, cleanup } = withDb();
  try {
    seedDatabase(db);
    const admin = db
      .prepare<[string], { id: string; totp_secret_ciphertext: string | null }>(
        "SELECT id, totp_secret_ciphertext FROM users WHERE email = ?",
      )
      .get("admin@easylaw.local");
    assert.ok(admin);

    assert.deepEqual(
      assertManagementAccess(db, { userId: admin.id, scope: "admin" }),
      { ok: false, reason: "totp_required" },
    );

    await createTotpEnrollment(db, admin.id);
    const enrolled = db
      .prepare<[string], { totp_secret_ciphertext: string }>(
        "SELECT totp_secret_ciphertext FROM users WHERE id = ?",
      )
      .get(admin.id);
    assert.ok(enrolled);
    const secret = decryptSecret(enrolled.totp_secret_ciphertext);
    const code = await generate({ secret });
    const verified = await verifyTotpEnrollment(db, admin.id, code);
    assert.equal(verified.ok, true);
    assert.equal(verified.ok ? verified.recoveryCodes.length : 0, 10);

    assert.deepEqual(
      assertManagementAccess(db, { userId: admin.id, scope: "admin" }),
      { ok: true },
    );

    const recoveryResult = consumeRecoveryCode(
      db,
      admin.id,
      verified.ok ? verified.recoveryCodes[0] : "",
    );
    assert.equal(recoveryResult.ok, true);
  } finally {
    cleanup();
  }
});
