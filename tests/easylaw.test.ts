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
  consumeMagicLink,
  consumeRecoveryCode,
  createMagicLink,
  createTotpEnrollment,
  verifyTotpEnrollment,
} from "../src/lib/auth";
import {
  createAltchaChallenge,
  getCaptchaSettings,
  verifyAltchaPayload,
} from "../src/lib/captcha";
import { createDatabase } from "../src/lib/db";
import { seedDatabase } from "../src/lib/db/seed";
import {
  addLegalDictionaryTerm,
  buildTermExplanation,
  extractDictionaryTerms,
} from "../src/lib/dictionary";
import {
  mergeExternalFirst,
  parseOpenLawSearchResponse,
  syncSampleExternalCatalog,
} from "../src/lib/external-law";
import { listIntegrationEvents } from "../src/lib/integration-events";
import {
  completeGenerationJob,
  createOrAttachGenerationJob,
} from "../src/lib/jobs";
import { parseJudgmentDocument } from "../src/lib/judgment-document";
import { buildResearchPlan } from "../src/lib/legal-research";
import { sendReadyNotifications } from "../src/lib/notifications";
import {
  getPublicJudgmentByIdentifier,
  getPublicJudgments,
} from "../src/lib/queries";
import { getPublicRequestOrigin } from "../src/lib/request-origin";
import { checkAnonymousAccess } from "../src/lib/security/anonymous-access";
import { decryptSecret } from "../src/lib/security/crypto";
import { getSessionUser } from "../src/lib/session";
import { setSetting } from "../src/lib/settings";
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
    assert.equal(
      getPublicJudgmentByIdentifier(db, judgments[0].id)?.caseNumber,
      judgments[0].caseNumber,
    );
    assert.ok(getPublicJudgmentByIdentifier(db, judgments[0].id)?.originalText);
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

test("open law parser normalizes public case records", () => {
  const records = parseOpenLawSearchResponse({
    PrecSearch: {
      prec: [
        {
          사건명: "손해배상",
          사건번호: "2024가단1234",
          법원명: "서울중앙지방법원",
          판시사항: "(심리불속행) 원심 판단을 수긍한 사안",
          판례내용: "원고의 상고를 심리불속행으로 기각한다.",
          선고일자: "20240501",
          판례상세링크: "/DRF/lawService.do?OC=test&target=prec&ID=1",
          판례일련번호: "123456",
        },
      ],
    },
  });

  assert.equal(records.length, 1);
  assert.deepEqual(
    {
      caseNumber: records[0].caseNumber,
      courtName: records[0].courtName,
      decidedOn: records[0].decidedOn,
      sourceProvider: records[0].sourceProvider,
      title: records[0].title,
      originalText: records[0].originalText,
    },
    {
      caseNumber: "2024가단1234",
      courtName: "서울중앙지방법원",
      decidedOn: "2024-05-01",
      sourceProvider: "open-law",
      title: "(심리불속행) 손해배상",
      originalText: "원고의 상고를 심리불속행으로 기각한다.",
    },
  );
  assert.ok(records[0].sourceUrl?.startsWith("https://www.law.go.kr/"));
});

test("judgment document parser splits bracket headings and numbered reasons", () => {
  const sections = parseJudgmentDocument(
    "【원고, 피상고인】 원고<br/>【주    문】<br/>상고를 모두 기각한다.<br/><br/>【이    유】 1. 사안의 개요<br/>가. 원고는 손해배상을 청구하였다.",
  );

  assert.deepEqual(
    sections.map((section) => ({
      kind: section.kind,
      title: section.title,
    })),
    [
      { kind: "meta", title: "원고, 피상고인" },
      { kind: "order", title: "주문" },
      { kind: "reason", title: "이유" },
    ],
  );
  assert.equal(sections[1].paragraphs[0].text, "상고를 모두 기각한다.");
  assert.equal(sections[2].paragraphs[0].kind, "numbered");
  assert.equal(sections[2].paragraphs[1].kind, "numbered");
});

test("public request origin respects reverse proxy headers", () => {
  const request = new Request("http://127.0.0.1:3000/api/auth/magic-link", {
    headers: {
      "x-forwarded-host": "easylaw.example.com",
      "x-forwarded-proto": "https",
    },
  });

  assert.equal(
    getPublicRequestOrigin(request).toString(),
    "https://easylaw.example.com/",
  );
});

test("legal research harness assigns coverage and evidence", async () => {
  const { db, cleanup } = withDb();
  try {
    const plan = await buildResearchPlan(
      db,
      "중고나라에서 물건값을 입금했는데 판매자가 잠적했습니다. 돈은 찾을 수 있나요?",
    );

    assert.equal(plan.coverageLevel, 2);
    assert.equal(plan.intent, "피해 회복과 민사 청구 가능성 확인");
    assert.ok(
      plan.evidence.some((item) => item.source === "공개법령 판례 API"),
    );
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

test("CAPTCHA settings tune challenge generation and audit records", async () => {
  const { db, cleanup } = withDb();
  try {
    setSetting(db, "captcha_algorithm", "SHA-384");
    setSetting(db, "captcha_cost", "50");
    setSetting(db, "captcha_expires_minutes", "7");
    setSetting(db, "captcha_min_duration_ms", "900");

    const settings = getCaptchaSettings(db);
    assert.equal(settings.algorithm, "SHA-384");
    assert.equal(settings.expiresMinutes, 7);
    assert.equal(settings.minDurationMs, 900);

    const challenge = await createAltchaChallenge(db);
    assert.ok(challenge);
    assert.equal(challenge.parameters.algorithm, "SHA-384");
    assert.equal(challenge.parameters.cost, 8);
    assert.deepEqual(challenge.configuration, { minDuration: 900 });

    const events = listIntegrationEvents(db, "captcha");
    assert.equal(events[0]?.action, "challenge.create");
    assert.equal(events[0]?.status, "success");
    assert.deepEqual(events[0]?.metadata, {
      algorithm: "SHA-384",
      cost: 8,
      expiresMinutes: 7,
      level: "standard",
    });
  } finally {
    cleanup();
  }
});

test("magic links can be consumed into a user identity", () => {
  const { db, cleanup } = withDb();
  try {
    const created = createMagicLink(db, "reader@example.com");
    assert.equal(created.ok, true);
    assert.ok(created.ok);

    const consumed = consumeMagicLink(db, created.token);
    assert.deepEqual(consumed, {
      ok: true,
      requiresTotp: false,
      userId: created.userId,
    });
    assert.deepEqual(consumeMagicLink(db, created.token), {
      ok: false,
      reason: "invalid_or_expired",
    });
  } finally {
    cleanup();
  }
});

test("standard dictionary JSON entries are normalized for lookup", () => {
  const terms = extractDictionaryTerms({
    channel: {
      item: [
        {
          word: "판결",
          sense: {
            definition: "시비나 선악을 판단하여 결정함.",
            pos: "명사",
            sense_no: "1",
          },
        },
        {
          word: "판결",
          sense_def: "법원이 소송 사건에 대하여 내리는 판단.",
          품사: "명사",
          뜻풀이번호: 2,
        },
      ],
    },
  });

  assert.deepEqual(
    terms.map((term) => ({
      definition: term.definition,
      partOfSpeech: term.partOfSpeech,
      senseNo: term.senseNo,
      word: term.word,
    })),
    [
      {
        definition: "시비나 선악을 판단하여 결정함.",
        partOfSpeech: "명사",
        senseNo: "1",
        word: "판결",
      },
      {
        definition: "법원이 소송 사건에 대하여 내리는 판단.",
        partOfSpeech: "명사",
        senseNo: "2",
        word: "판결",
      },
    ],
  );
});

test("term explanations prefer legal terms over public dictionaries", () => {
  const { db, cleanup } = withDb();
  try {
    db.prepare(
      `INSERT INTO dictionary_terms
        (id, source, priority, word, sense_no, definition, raw_json, updated_at)
        VALUES
        ('dict_basic_test', 'basic', 2, '기판력', '1', '기초 사전 설명', '{}', ?),
        ('dict_standard_test', 'standard', 3, '기판력', '1', '표준 사전 설명', '{}', ?)`,
    ).run(new Date().toISOString(), new Date().toISOString());
    addLegalDictionaryTerm(db, {
      definition: "확정된 판결의 판단을 다시 다투기 어렵게 하는 효력",
      word: "기판력",
    });

    const explanation = buildTermExplanation(db, { term: "기판력" });
    assert.equal(explanation.priority, "자체 법률 용어 사전");
    assert.equal(
      explanation.definitions[0]?.definition,
      "확정된 판결의 판단을 다시 다투기 어렵게 하는 효력",
    );
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
