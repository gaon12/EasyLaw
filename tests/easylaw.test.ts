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
  disableTotp,
  ensureUser,
  getAccountSecurityState,
  regenerateRecoveryCodes,
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
  ensurePublicJudgmentOriginalText,
  mergeExternalFirst,
  parseOpenLawSearchResponse,
  syncSampleExternalCatalog,
  upsertJudgmentFromExternal,
} from "../src/lib/external-law";
import { listIntegrationEvents } from "../src/lib/integration-events";
import {
  completeGenerationJob,
  createOrAttachGenerationJob,
} from "../src/lib/jobs";
import {
  getJudgmentCollectionProgress,
  getJudgmentCollectionStatus,
  listJudgmentCollectionRuns,
  runJudgmentCollection,
  updateJudgmentCollectionSettings,
} from "../src/lib/judgment-collection";
import { parseJudgmentDocument } from "../src/lib/judgment-document";
import { extractRelatedCaseReferences } from "../src/lib/judgment-relations";
import { buildResearchPlan } from "../src/lib/legal-research";
import {
  completeLoginChallenge,
  createLoginChallenge,
} from "../src/lib/login-challenge";
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
  assert.equal(records[0].sourceUrl?.includes("OC="), false);
});

test("open law parser normalizes constitutional and law records", () => {
  const constitutionalRecords = parseOpenLawSearchResponse(
    {
      DetcSearch: {
        detc: [
          {
            사건명: "탄핵심판",
            사건번호: "2024헌나1",
            종국일자: "20240530",
            헌재결정례상세링크: "/DRF/lawService.do?target=detc&ID=456",
            헌재결정례일련번호: 456,
          },
        ],
      },
    },
    "detc",
  );
  const lawRecords = parseOpenLawSearchResponse(
    {
      LawSearch: {
        law: [
          {
            공포번호: "12345",
            법령ID: "001234",
            법령구분명: "법률",
            법령명한글: "민법",
            법령상세링크: "/DRF/lawService.do?target=law&ID=001234",
            시행일자: "20260702",
            소관부처명: "법무부",
          },
        ],
      },
    },
    "law",
  );

  assert.deepEqual(
    {
      caseType: constitutionalRecords[0]?.caseType,
      courtName: constitutionalRecords[0]?.courtName,
      sourceProvider: constitutionalRecords[0]?.sourceProvider,
    },
    {
      caseType: "constitutional",
      courtName: "헌법재판소",
      sourceProvider: "open-law-constitutional",
    },
  );
  assert.deepEqual(
    {
      caseNumber: lawRecords[0]?.caseNumber,
      caseType: lawRecords[0]?.caseType,
      courtName: lawRecords[0]?.courtName,
      sourceProvider: lawRecords[0]?.sourceProvider,
    },
    {
      caseNumber: "법령 001234-12345",
      caseType: "law",
      courtName: "법무부",
      sourceProvider: "open-law-law",
    },
  );
});

test("manual judgment collection stores fetched public judgments", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "open_law_oc", "test-oc");
    const requestedSearches: string[] = [];
    const requestedDetails: string[] = [];
    const requestedQueries: Array<string | null> = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const target = url.searchParams.get("target") ?? "prec";
      if (url.pathname.endsWith("/lawService.do")) {
        requestedDetails.push(`${target}:${url.searchParams.get("ID")}`);
        return new Response(
          JSON.stringify({
            PrecService: {
              판례내용: `상세 본문 ${url.searchParams.get("ID")}`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const page = url.searchParams.get("page") ?? "1";
      requestedSearches.push(`${target}:${page}`);
      (requestedQueries as Array<string | null>).push(
        url.searchParams.get("query"),
      );
      if (target === "detc") {
        return new Response(JSON.stringify({ DetcSearch: { detc: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (target === "law") {
        return new Response(JSON.stringify({ LawSearch: { law: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      const prec =
        page === "1"
          ? [
              {
                caseNumber: "2026Da1001",
                courtName: "Supreme Court",
                decidedOn: "20260701",
                detailLink: "/DRF/lawService.do?target=prec&ID=auto-1",
                precSeq: "auto-1",
                title: "Collected damages judgment",
              },
            ]
          : page === "2"
            ? [
                {
                  caseNumber: "2026Da1002",
                  courtName: "Supreme Court",
                  decidedOn: "20260702",
                  detailLink: "/DRF/lawService.do?target=prec&ID=auto-2",
                  precSeq: "auto-2",
                  title: "Collected warranty judgment",
                },
              ]
            : [];
      return new Response(JSON.stringify({ PrecSearch: { prec } }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    };

    updateJudgmentCollectionSettings(db, {
      enabled: true,
      intervalMinutes: 10,
    });
    const result = await runJudgmentCollection(db, {
      forceRefresh: true,
      trigger: "manual",
    });
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.deepEqual(requestedSearches, [
      "prec:1",
      "prec:2",
      "prec:3",
      "detc:1",
      "law:1",
    ]);
    assert.deepEqual(requestedDetails, ["prec:auto-1", "prec:auto-2"]);
    assert.deepEqual(requestedQueries, [null, null, null, null, null]);
    assert.equal(result.importedCount, 2);
    assert.equal(result.createdCount, 2);

    const openLawJudgments = getPublicJudgments(db).filter(
      (judgment) => judgment.sourceProvider === "open-law",
    );
    const collected = openLawJudgments.find(
      (judgment) => judgment.caseNumber === "2026Da1001",
    );
    const secondCollected = openLawJudgments.find(
      (judgment) => judgment.caseNumber === "2026Da1002",
    );
    assert.equal(collected?.caseNumber, "2026Da1001");
    assert.equal(collected?.title, "Collected damages judgment");
    assert.equal(
      getPublicJudgmentByIdentifier(db, collected?.id ?? "")?.originalText,
      "상세 본문 auto-1",
    );
    assert.equal(secondCollected?.title, "Collected warranty judgment");

    const status = getJudgmentCollectionStatus(db);
    assert.equal(status.status, "success");
    assert.equal(status.lastImportedCount, 2);
    assert.ok(status.nextRunAt);

    const runs = listJudgmentCollectionRuns(db);
    assert.equal(runs[0]?.trigger, "manual");
    assert.equal(runs[0]?.status, "success");
    assert.equal(runs[0]?.createdCount, 2);
    assert.equal(runs[0]?.query, "전체 판례·헌재·법령");
    const progress = getJudgmentCollectionProgress(db);
    assert.equal(progress?.stage, "done");
    assert.equal(progress?.percent, 100);
    assert.equal(progress?.current, 2);
    assert.equal(progress?.total, 2);

    requestedSearches.length = 0;
    requestedDetails.length = 0;
    requestedQueries.length = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const target = url.searchParams.get("target") ?? "prec";
      if (url.pathname.endsWith("/lawService.do")) {
        requestedDetails.push(`${target}:${url.searchParams.get("ID")}`);
        return new Response(
          JSON.stringify({
            PrecService: {
              판례내용: `상세 본문 ${url.searchParams.get("ID")}`,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const page = url.searchParams.get("page") ?? "1";
      requestedSearches.push(`${target}:${page}`);
      (requestedQueries as Array<string | null>).push(
        url.searchParams.get("query"),
      );
      if (target === "detc") {
        return new Response(JSON.stringify({ DetcSearch: { detc: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (target === "law") {
        return new Response(JSON.stringify({ LawSearch: { law: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      const prec =
        page === "1"
          ? [
              {
                caseNumber: "2026Da1003",
                courtName: "Supreme Court",
                decidedOn: "20260703",
                detailLink: "/DRF/lawService.do?target=prec&ID=auto-3",
                precSeq: "auto-3",
                title: "Newer collected judgment",
              },
              {
                caseNumber: "2026Da1002",
                courtName: "Supreme Court",
                decidedOn: "20260702",
                detailLink: "/DRF/lawService.do?target=prec&ID=auto-2",
                precSeq: "auto-2",
                title: "Existing collected judgment",
              },
            ]
          : [
              {
                caseNumber: "2026Da1004",
                courtName: "Supreme Court",
                decidedOn: "20260704",
                detailLink: "/DRF/lawService.do?target=prec&ID=auto-4",
                precSeq: "auto-4",
                title: "Should not be requested",
              },
            ];
      return new Response(JSON.stringify({ PrecSearch: { prec } }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    };

    const secondResult = await runJudgmentCollection(db, {
      forceRefresh: true,
      trigger: "manual",
    });
    assert.equal(secondResult.ok, true);
    assert.ok(secondResult.ok);
    assert.deepEqual(requestedSearches, ["prec:1", "detc:1", "law:1"]);
    assert.deepEqual(requestedDetails, ["prec:auto-3"]);
    assert.deepEqual(requestedQueries, [null, null, null]);
    assert.equal(secondResult.importedCount, 1);
    assert.equal(secondResult.createdCount, 1);
    const secondProgress = getJudgmentCollectionProgress(db);
    assert.equal(secondProgress?.stage, "done");
    assert.equal(secondProgress?.current, 1);
    assert.equal(secondProgress?.total, 1);
    const afterIncremental = getPublicJudgments(db).filter(
      (judgment) => judgment.sourceProvider === "open-law",
    );
    assert.ok(
      afterIncremental.some((judgment) => judgment.caseNumber === "2026Da1003"),
    );
    assert.equal(
      afterIncremental.some((judgment) => judgment.caseNumber === "2026Da1004"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("open law detail hydration replaces truncated tax-law previews", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "open_law_oc", "test-oc");
    const judgmentId = upsertJudgmentFromExternal(db, {
      caseNumber: "서울행정법원-2025-구단-53770",
      caseType: "administrative",
      courtName: "서울행정법원",
      decidedOn: "2026-05-29",
      externalId: "619589",
      originalText: "주 문 1. 원고의 청구를 기각한다. 이 유 일부 미리보기...",
      sourceProvider: "open-law",
      sourceUrl:
        "https://www.law.go.kr/DRF/lawService.do?target=prec&ID=619589",
      title: "이 사건 토지가 비사업용 토지에 해당하는지 여부",
    });
    const detailedParagraph =
      "법원은 양도 시기, 보유 기간, 실제 이용 현황, 제출된 과세자료와 당사자의 주장을 종합하여 비사업용 토지 해당 여부를 판단하였다. ".repeat(
        3,
      );
    const fullText = `<html><body><p><span>주 문</span></p><p><span>1. 원고의 청구를 기각한다.</span></p><p><span>이 유</span></p><p><span>1. 처분의 경위</span></p><p><span>원고는 토지를 양도하였다.</span></p><p><span>${detailedParagraph}</span></p><p><span>3. 결론</span></p><p><span>그렇다면 원고의 청구는 이유 없으므로 이를 기각하기로 하여 주문과 같이 판결한다.</span></p></body></html>`;

    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "www.law.go.kr") {
        return new Response(
          JSON.stringify({ Law: "일치하는 판례가 없습니다." }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }
      if (url.hostname === "taxlaw.nts.go.kr") {
        const body = init?.body?.toString() ?? "";
        const params = new URLSearchParams(body);
        const actionId = params.get("actionId");
        if (actionId === "ASIPDI002PR01") {
          return Response.json({
            data: {
              ASIPDI002PR01: {
                body: [
                  {
                    dcm: {
                      DOC_ID: "200000000000021471",
                      FILE_CN:
                        "주 문 1. 원고의 청구를 기각한다. 이 유 일부 미리보기...",
                      NTST_DCM_DSCM_CNTN: "서울행정법원-2025-구단-53770",
                      TTL: "이 사건 토지가 비사업용 토지에 해당하는지 여부",
                    },
                  },
                ],
              },
            },
            message: null,
            status: "SUCCESS",
          });
        }
        if (actionId === "ASIQTB002PR01") {
          return Response.json({
            data: {
              ASIQTB002PR01: {
                dcmHwpEditorDVOList: [{ dcmFleByte: fullText }],
              },
            },
            message: null,
            status: "SUCCESS",
          });
        }
      }
      return new Response("", { status: 404 });
    };

    const judgment = getPublicJudgmentByIdentifier(db, judgmentId);
    assert.ok(judgment);
    const hydrated = await ensurePublicJudgmentOriginalText(db, judgment);
    assert.ok(hydrated);
    assert.equal(hydrated.endsWith("..."), false);
    assert.match(hydrated, /결론/);
    assert.match(hydrated, /주문과 같이 판결한다/);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("judgment document parser splits bracket headings and numbered reasons", () => {
  const sections = parseJudgmentDocument(
    "【원고, 피상고인】 원고<br/>【주    문】<br/>상고를 모두 기각한다.<br/><br/>【이    유】 1. 사안의 개요<br/>가. 관련 법리<br/>1) 통신비밀보호법 제3조 제1항은 공개되지 아니한 타인 간의 대화를 녹음하지 못한다고 규정하고 있다.",
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
  assert.deepEqual(sections[1].blocks[0], {
    kind: "paragraph",
    numbered: false,
    text: "상고를 모두 기각한다.",
  });
  assert.deepEqual(sections[2].blocks[0], {
    kind: "heading",
    level: 3,
    text: "1. 사안의 개요",
  });
  assert.deepEqual(sections[2].blocks[1], {
    kind: "heading",
    level: 4,
    text: "가. 관련 법리",
  });
  assert.equal(sections[2].blocks[2].kind, "paragraph");
});

test("judgment document parser splits inline spaced judgment headings", () => {
  const sections = parseJudgmentDocument(
    "주 문 1. 원고의 청구를 기각한다. 2. 소송비용은 원고가 부담한다. 청 구 취 지 피고가 2024. 4. 4. 원고에게 한 부과처분을 취소한다. 이 유 1. 처분의 경위 가. 원고는 토지를 양도하였다.",
  );

  assert.deepEqual(
    sections.map((section) => ({
      kind: section.kind,
      title: section.title,
    })),
    [
      { kind: "order", title: "주문" },
      { kind: "default", title: "청구취지" },
      { kind: "reason", title: "이유" },
    ],
  );
  assert.equal(sections[0].blocks.length, 2);
  assert.deepEqual(sections[0].blocks[0], {
    kind: "paragraph",
    numbered: true,
    text: "1. 원고의 청구를 기각한다.",
  });
  assert.equal(sections[1].blocks[0].text.startsWith("피고가"), true);
  assert.deepEqual(sections[2].blocks[0], {
    kind: "heading",
    level: 3,
    text: "1. 처분의 경위",
  });
  assert.deepEqual(sections[2].blocks[1], {
    kind: "paragraph",
    numbered: true,
    text: "가. 원고는 토지를 양도하였다.",
  });
});

test("judgment relation parser extracts lower court case numbers", () => {
  const references = extractRelatedCaseReferences(
    "【원심판결】 서울중앙지법 2024. 1. 23. 선고 2023나4119 판결<br/>【이 유】 현재 사건은 2024다222212이다.",
    "2024다222212",
  );

  assert.deepEqual(references, [
    {
      caseNumber: "2023나4119",
      excerpt: "【원심판결】 서울중앙지법 2024. 1. 23. 선고 2023나4119 판결",
      label: "원심판결",
    },
  ]);
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

test("basic dictionary LMF JSON entries are normalized for lookup", () => {
  const terms = extractDictionaryTerms({
    LexicalResource: {
      Lexicon: {
        LexicalEntry: [
          {
            Lemma: { feat: { att: "writtenForm", val: "가" } },
            Sense: [
              {
                Equivalent: [
                  {
                    feat: [
                      { att: "language", val: "영어" },
                      { att: "definition", val: "A translated definition." },
                    ],
                  },
                ],
                att: "id",
                feat: {
                  att: "definition",
                  val: "어떤 장소나 물건의 둘레나 끝부분.",
                },
                val: "1",
              },
            ],
            feat: [
              { att: "partOfSpeech", val: "명사" },
              { att: "origin", val: "可" },
            ],
          },
        ],
      },
    },
  });

  assert.deepEqual(
    terms.map((term) => ({
      definition: term.definition,
      origin: term.origin,
      partOfSpeech: term.partOfSpeech,
      senseNo: term.senseNo,
      word: term.word,
    })),
    [
      {
        definition: "어떤 장소나 물건의 둘레나 끝부분.",
        origin: "可",
        partOfSpeech: "명사",
        senseNo: "1",
        word: "가",
      },
    ],
  );
});

test("standard dictionary nested word_info entries are normalized for lookup", () => {
  const terms = extractDictionaryTerms({
    channel: {
      item: [
        {
          target_code: 17979,
          word_info: {
            original_language_info: [
              { language_type: "한자", original_language: "決論" },
              { language_type: "고유어", original_language: "하다" },
            ],
            pos_info: [
              {
                comm_pattern_info: [
                  {
                    sense_info: [
                      {
                        definition: "의론에서 가부와 시비를 따져 결정하다.",
                        sense_code: 523883,
                      },
                    ],
                  },
                ],
                pos: "동사",
              },
            ],
            word: "결론-하다01",
          },
        },
      ],
    },
  });

  assert.deepEqual(
    terms.map((term) => ({
      definition: term.definition,
      origin: term.origin,
      partOfSpeech: term.partOfSpeech,
      senseNo: term.senseNo,
      word: term.word,
    })),
    [
      {
        definition: "의론에서 가부와 시비를 따져 결정하다.",
        origin: "決論 하다",
        partOfSpeech: "동사",
        senseNo: "523883",
        word: "결론하다",
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
        ('dict_basic_test', 'basic', 1, '기판력', '1', '기초 사전 설명', '{}', ?),
        ('dict_standard_test', 'standard', 2, '기판력', '1', '표준 사전 설명', '{}', ?)`,
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

test("term explanations keep standard dictionary after basic senses", () => {
  const { db, cleanup } = withDb();
  try {
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO dictionary_terms
        (id, source, priority, word, sense_no, definition, raw_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '{}', ?)`,
    );
    for (let index = 1; index <= 10; index += 1) {
      insert.run(
        `dict_basic_priority_${index}`,
        "basic",
        1,
        "권리",
        String(index),
        `기초 사전 설명 ${index}`,
        now,
      );
    }
    insert.run(
      "dict_standard_priority",
      "standard",
      2,
      "권리",
      "1",
      "표준 사전 설명",
      now,
    );

    const explanation = buildTermExplanation(db, { term: "권리" });
    assert.equal(explanation.priority, "한국어기초사전");
    assert.equal(explanation.definitions[0]?.source, "basic");
    assert.ok(
      explanation.definitions.some(
        (definition) =>
          definition.source === "standard" &&
          definition.definition === "표준 사전 설명",
      ),
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
    assert.deepEqual(getAccountSecurityState(db, admin.id)?.recoveryCodes, {
      total: 10,
      unused: 10,
    });

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
    assert.deepEqual(getAccountSecurityState(db, admin.id)?.recoveryCodes, {
      total: 10,
      unused: 9,
    });

    const regenerated = regenerateRecoveryCodes(db, admin.id);
    assert.equal(regenerated.ok, true);
    assert.equal(regenerated.ok ? regenerated.recoveryCodes.length : 0, 10);
    assert.deepEqual(getAccountSecurityState(db, admin.id)?.recoveryCodes, {
      total: 10,
      unused: 10,
    });
    assert.deepEqual(await disableTotp(db, admin.id, code), {
      ok: false,
      reason: "totp_required",
    });
    assert.equal(
      consumeRecoveryCode(
        db,
        admin.id,
        verified.ok ? verified.recoveryCodes[1] : "",
      ).ok,
      false,
    );
  } finally {
    cleanup();
  }
});

test("optional accounts can disable 2FA and invalidate recovery codes", async () => {
  const { db, cleanup } = withDb();
  try {
    const user = ensureUser(db, "optional-2fa@example.com");
    await createTotpEnrollment(db, user.id);
    const enrolled = db
      .prepare<[string], { totp_secret_ciphertext: string }>(
        "SELECT totp_secret_ciphertext FROM users WHERE id = ?",
      )
      .get(user.id);
    assert.ok(enrolled);

    const secret = decryptSecret(enrolled.totp_secret_ciphertext);
    const code = await generate({ secret });
    const verified = await verifyTotpEnrollment(db, user.id, code);
    assert.equal(verified.ok, true);
    const enabledState = getAccountSecurityState(db, user.id);
    assert.equal(enabledState?.authentication.totpCanDisable, true);
    assert.equal(enabledState?.authentication.totpEnabled, true);
    assert.equal(enabledState?.authentication.totpRequired, false);
    assert.ok(enabledState?.authentication.totpVerifiedAt);

    assert.deepEqual(await disableTotp(db, user.id, code), { ok: true });
    assert.deepEqual(getAccountSecurityState(db, user.id)?.recoveryCodes, {
      total: 0,
      unused: 0,
    });
    assert.deepEqual(getAccountSecurityState(db, user.id)?.authentication, {
      emailVerifiedAt: null,
      magicLinkVerifiedAt: null,
      totpCanDisable: false,
      totpEnabled: false,
      totpRequired: false,
      totpVerifiedAt: null,
    });
    assert.equal(
      consumeRecoveryCode(
        db,
        user.id,
        verified.ok ? verified.recoveryCodes[0] : "",
      ).ok,
      false,
    );
  } finally {
    cleanup();
  }
});

test("email verification cannot create a session before required 2FA", async () => {
  const { db, cleanup } = withDb();
  try {
    const user = ensureUser(db, "required-login-2fa@example.com");
    db.prepare(
      "UPDATE users SET role = 'admin', totp_required = 1 WHERE id = ?",
    ).run(user.id);
    await createTotpEnrollment(db, user.id);
    const enrolled = db
      .prepare<[string], { totp_secret_ciphertext: string }>(
        "SELECT totp_secret_ciphertext FROM users WHERE id = ?",
      )
      .get(user.id);
    assert.ok(enrolled);
    const secret = decryptSecret(enrolled.totp_secret_ciphertext);
    const enrollmentCode = await generate({ secret });
    assert.equal(
      (await verifyTotpEnrollment(db, user.id, enrollmentCode)).ok,
      true,
    );

    const magicLink = createMagicLink(db, user.email);
    assert.ok(magicLink.ok);
    const emailVerified = consumeMagicLink(
      db,
      magicLink.ok ? magicLink.token : "",
    );
    assert.deepEqual(emailVerified, {
      ok: true,
      requiresTotp: true,
      userId: user.id,
    });
    assert.equal(
      db
        .prepare<[], { count: number }>(
          "SELECT COUNT(*) count FROM user_sessions",
        )
        .get()?.count,
      0,
    );

    const challenge = createLoginChallenge(db, user.id);
    assert.deepEqual(
      await completeLoginChallenge(db, challenge.token, "000000"),
      { ok: false, reason: "invalid_code" },
    );
    assert.equal(
      db
        .prepare<[], { count: number }>(
          "SELECT COUNT(*) count FROM user_sessions",
        )
        .get()?.count,
      0,
    );

    const loginCode = await generate({ secret });
    const completed = await completeLoginChallenge(
      db,
      challenge.token,
      loginCode,
    );
    assert.equal(completed.ok, true);
    assert.equal(
      completed.ok
        ? getSessionUser(db, completed.session.token)?.id
        : undefined,
      user.id,
    );
    assert.deepEqual(
      await completeLoginChallenge(db, challenge.token, loginCode),
      { ok: false, reason: "invalid_challenge" },
    );
  } finally {
    cleanup();
  }
});
