import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sha, solveChallenge } from "altcha/lib";
import { zipSync } from "fflate";
import { NextRequest } from "next/server";
import { generate } from "otplib";
import nextConfig from "../next.config";
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
  addJudgmentBookmark,
  isJudgmentBookmarked,
  listBookmarkedJudgmentIds,
  listUserBookmarkRows,
  removeJudgmentBookmark,
} from "../src/lib/bookmarks";
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
  getDictionaryImportProgress,
  updateDictionarySource,
  updateOpenLawLegalDictionary,
} from "../src/lib/dictionary";
import { sampleAnalysis } from "../src/lib/easyread";
import { processGenerationJob } from "../src/lib/easyread-generation";
import {
  ensurePublicJudgmentOriginalText,
  mergeExternalFirst,
  parseOpenLawSearchResponse,
  upsertJudgmentFromExternal,
} from "../src/lib/external-law";
import { listIntegrationEvents } from "../src/lib/integration-events";
import {
  approveGenerationJob,
  completeGenerationJob,
  createOrAttachGenerationJob,
  rejectGenerationJob,
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
import {
  searchJudgmentTexts,
  setJudgmentText,
} from "../src/lib/judgment-texts";
import { resetLegalData } from "../src/lib/legal-data-maintenance";
import {
  buildResearchPlan,
  type ResearchHarnessEvent,
} from "../src/lib/legal-research";
import { routeResearchQuery } from "../src/lib/legal-research-router";
import { requestLlmText } from "../src/lib/llm-client";
import { createLocalLegalToolbox } from "../src/lib/local-legal-toolbox";
import {
  completeLoginChallenge,
  createLoginChallenge,
} from "../src/lib/login-challenge";
import { handleMcpRequest } from "../src/lib/mcp-server";
import { sendReadyNotifications } from "../src/lib/notifications";
import { isOrganizationMember } from "../src/lib/organizations";
import {
  getAccessibleUserJudgmentById,
  getLatestAnalysis,
  getOrganizationSharedJudgments,
  getPublicJudgmentByIdentifier,
  getPublicJudgments,
} from "../src/lib/queries";
import { getPublicRequestOrigin } from "../src/lib/request-origin";
import { answerFormatInstruction } from "../src/lib/research-options";
import { optionalSafeNextPath, safeNextPath } from "../src/lib/safe-next-path";
import { checkAnonymousAccess } from "../src/lib/security/anonymous-access";
import { decryptSecret } from "../src/lib/security/crypto";
import { getSessionUser } from "../src/lib/session";
import { getSetting, setSetting } from "../src/lib/settings";
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

test("server config keeps native database and archive packages external", () => {
  assert.deepEqual(nextConfig.serverExternalPackages, [
    "7zip-bin-full",
    "better-sqlite3",
  ]);
});

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

function seedExternalFixture(db: ReturnType<typeof createDatabase>) {
  return [
    {
      caseNumber: "2023구합54112",
      caseType: "administrative" as const,
      courtName: "서울행정법원",
      decidedOn: "2024-01-26",
      externalId: "seoul-admin-2023guhap54112",
      originalText:
        "원고는 영업정지 처분의 취소를 구하였고, 법원은 처분 사유와 절차, 비례 원칙 위반 여부를 중심으로 판단하였습니다.",
      sourceProvider: "test-open-law",
      sourceUrl: "https://example.test/judgment/admin",
      summary: "취소소송 요건과 행정 처분 판단 구조를 보여주는 판결 예시",
      title: "영업정지 처분 취소 청구 사건",
    },
    {
      caseNumber: "2023고단000",
      caseType: "criminal" as const,
      courtName: "대전지방법원",
      decidedOn: "2023-12-12",
      externalId: "criminal-easyread-sample-2",
      originalText:
        "피고인의 행위가 특수절도죄의 구성요건에 해당하는지, 공모 관계와 양형 사유가 무엇인지 판단한 형사 판결 예시입니다.",
      sourceProvider: "test-open-law",
      sourceUrl: "https://example.test/judgment/criminal",
      summary: "형사 사건 Easy-Read 작성을 위한 기반 샘플",
      title: "특수절도 형사 판결 예시",
    },
    {
      caseNumber: "2024가단000",
      caseType: "civil" as const,
      courtName: "대전지방법원",
      decidedOn: "2024-04-15",
      externalId: "civil-easyread-sample-1",
      originalText:
        "원고는 손해배상을 청구하였고, 법원은 손해 발생, 인과관계, 배상 범위를 나누어 판단한 민사 판결 예시입니다.",
      sourceProvider: "test-open-law",
      sourceUrl: "https://example.test/judgment/civil",
      summary: "민사 사건 Easy-Read 작성을 위한 기반 샘플",
      title: "손해배상 청구 민사 판결 예시",
    },
  ].map((record) => upsertJudgmentFromExternal(db, record));
}

function createResearchFetchMock({
  llmResponses,
  toolResults = [],
}: {
  llmResponses: string[];
  toolResults?: Array<Record<string, unknown>>;
}) {
  const state = {
    llmBodies: [] as Array<Record<string, unknown>>,
    llmRequests: 0,
    toolArguments: [] as Array<Record<string, unknown>>,
    toolCalls: 0,
  };
  return {
    state,
    async fetch(input: string | URL | Request, init?: RequestInit) {
      const url = input instanceof Request ? input.url : String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (!url.startsWith("https://mcp.example")) {
        state.llmBodies.push(body);
        state.llmRequests += 1;
        const content = llmResponses.shift() ?? "";
        if (body.stream === true) {
          return new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
            {
              headers: { "Content-Type": "text/event-stream" },
            },
          );
        }
        return Response.json({
          choices: [{ message: { content } }],
        });
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 200 });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      const result =
        body.method === "initialize"
          ? {
              capabilities: { tools: {} },
              protocolVersion: body.params.protocolVersion,
              serverInfo: { name: "test-mcp", version: "1.0.0" },
            }
          : body.method === "tools/list"
            ? {
                tools: [
                  {
                    annotations: { readOnlyHint: true },
                    description: "법령과 판례를 검색합니다.",
                    inputSchema: {
                      properties: { query: { type: "string" } },
                      required: ["query"],
                      type: "object",
                    },
                    name: "search_law",
                    title: "법률 검색",
                  },
                ],
              }
            : body.method === "tools/call"
              ? {
                  content: [
                    {
                      text: JSON.stringify({
                        results: toolResults[state.toolCalls] ?? {},
                      }),
                      type: "text",
                    },
                  ],
                  isError: false,
                  structuredContent: {
                    results: toolResults[state.toolCalls++] ?? {},
                  },
                }
              : {};
      if (
        body.method === "tools/call" &&
        body.params &&
        typeof body.params === "object" &&
        "arguments" in body.params &&
        body.params.arguments &&
        typeof body.params.arguments === "object"
      ) {
        state.toolArguments.push(
          body.params.arguments as Record<string, unknown>,
        );
      }
      return Response.json(
        { id: body.id, jsonrpc: "2.0", result },
        { headers: { "Content-Type": "application/json" } },
      );
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
    seedExternalFixture(db);
    const judgments = getPublicJudgments(db);
    assert.ok(judgments.length >= 3);
    assert.equal(judgments[0].visibility, "public");
    assert.equal(
      getPublicJudgmentByIdentifier(db, judgments[0].id)?.caseNumber,
      judgments[0].caseNumber,
    );
    assert.ok(getPublicJudgmentByIdentifier(db, judgments[0].id)?.originalText);
    assert.ok(
      judgments.every((item) => item.sourceProvider === "test-open-law"),
    );
  } finally {
    cleanup();
  }
});

test("generation jobs dedupe and notification sending is idempotent", async () => {
  const { db, cleanup } = withDb();
  try {
    seedExternalFixture(db);
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
    await completeGenerationJob(db, firstJobId, {
      analysis: sampleAnalysis,
      modelName: "test-model",
      promptVersion: "easyread-test",
    });
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

test("judgment full-text search finds documents by body keywords", () => {
  const { db, cleanup } = withDb();
  try {
    seedExternalFixture(db);
    const hits = searchJudgmentTexts(db, "영업정지");
    assert.ok(hits.length >= 1, "FTS should match 원문 keywords");
    assert.match(hits[0].snippet, /영업정지/);

    const row = db
      .prepare<[string], { case_number: string }>(
        "SELECT case_number FROM judgments WHERE id = ?",
      )
      .get(hits[0].judgmentId);
    assert.equal(row?.case_number, "2023구합54112");

    // 2자 토큰은 unicode61 단어 인덱스의 접두 매칭으로 찾는다.
    assert.ok(searchJudgmentTexts(db, "비례").length >= 1);
    assert.ok(searchJudgmentTexts(db, "처분").length >= 1);

    // 원문 수정 시 트리거로 인덱스가 갱신되어야 한다.
    setJudgmentText(db, hits[0].judgmentId, "완전히 다른 내용의 문서입니다.");
    assert.equal(searchJudgmentTexts(db, "영업정지").length, 0);
    assert.ok(searchJudgmentTexts(db, "완전히").length >= 1);
  } finally {
    cleanup();
  }
});

test("easy-read generation produces a grounded analysis via the LLM", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    seedExternalFixture(db);
    setSetting(db, "llm_provider", "OpenAI");
    setSetting(db, "llm_api_base_url", "https://llm.example/v1");
    setSetting(db, "llm_model", "test-model");
    setSetting(db, "llm_api_key", "test-key", true);

    const judgment = getPublicJudgments(db)[0];
    const jobId = createOrAttachGenerationJob(db, judgment.id);
    const analysisJson = JSON.stringify({
      summary: "법원은 영업정지 처분을 취소했습니다.",
      easyRead: ["원고가 처분 취소를 청구했습니다.", "법원이 받아들였습니다."],
      timeline: ["처분", "소송", "판결"],
      claims: ["원고는 처분이 위법하다고 주장했습니다."],
      courtReasoning: ["법원은 비례 원칙 위반을 인정했습니다."],
      finalResult: "처분은 취소됩니다.",
      terms: [{ term: "처분", explanation: "행정기관의 결정입니다." }],
      sourceGrounds: [
        { label: "결론", excerpt: "원고는 영업정지 처분의 취소를 구하였고" },
      ],
      unknowns: ["항소 여부는 알 수 없습니다."],
      warnings: [],
    });
    globalThis.fetch = async () =>
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: analysisJson } }] })}\n\ndata: [DONE]\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );

    const result = await processGenerationJob(db, jobId);
    assert.equal(result.ok, true);

    const analysis = getLatestAnalysis(db, judgment.id);
    assert.ok(analysis);
    assert.match(analysis.summary, /영업정지/);
    assert.ok(
      analysis.warnings.some((warning) => warning.includes("법률자문")),
      "generated analysis must keep the legal-advice disclaimer",
    );
    const storedJob = db
      .prepare<[string], { status: string }>(
        "SELECT status FROM judgment_generation_jobs WHERE id = ?",
      )
      .get(jobId);
    assert.equal(storedJob?.status, "ready");
    const storedResult = db
      .prepare<[], { model_name: string | null; confidence_label: string }>(
        "SELECT model_name, confidence_label FROM analysis_results LIMIT 1",
      )
      .get();
    assert.equal(storedResult?.model_name, "test-model");
    assert.equal(storedResult?.confidence_label, "ai_generated");
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("organization sharing scopes user documents to members", () => {
  const { db, cleanup } = withDb();
  try {
    const owner = ensureUser(db, "org-owner@example.com");
    const member = ensureUser(db, "org-member@example.com");
    const outsider = ensureUser(db, "org-outsider@example.com");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO organizations (id, name, slug, owner_user_id, created_at, updated_at)
        VALUES ('org_share_test', '테스트 조직', 'share-test', ?, ?, ?)`,
    ).run(owner.id, now, now);
    db.prepare(
      `INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
        VALUES ('org_share_member', 'org_share_test', ?, 'member', ?)`,
    ).run(member.id, now);
    db.prepare(
      `INSERT INTO judgments
        (id, case_number, court_name, decided_on, title, case_type, status,
         visibility, source_provider, source_external_id, source_trust,
         created_by_user_id, created_at, updated_at)
       VALUES ('org-share-doc', '사용자 입력', '직접 입력', '2026-01-01',
         '조직 공유 문서', 'custom', 'pending', 'private', 'user-paste',
         'org-share-doc', 'user_uploaded', ?, ?, ?)`,
    ).run(owner.id, now, now);
    setJudgmentText(db, "org-share-doc", "조직 공유 테스트 본문입니다.");

    assert.equal(isOrganizationMember(db, "org_share_test", owner.id), true);
    assert.equal(isOrganizationMember(db, "org_share_test", member.id), true);
    assert.equal(
      isOrganizationMember(db, "org_share_test", outsider.id),
      false,
    );

    // 공유 전에는 만든 사람만 접근할 수 있다.
    assert.ok(getAccessibleUserJudgmentById(db, "org-share-doc", owner.id));
    assert.equal(
      getAccessibleUserJudgmentById(db, "org-share-doc", member.id),
      null,
    );

    db.prepare(
      `UPDATE judgments
        SET visibility = 'organization', organization_id = 'org_share_test'
        WHERE id = 'org-share-doc'`,
    ).run();

    assert.ok(getAccessibleUserJudgmentById(db, "org-share-doc", owner.id));
    assert.ok(getAccessibleUserJudgmentById(db, "org-share-doc", member.id));
    assert.equal(
      getAccessibleUserJudgmentById(db, "org-share-doc", outsider.id),
      null,
    );

    const shared = getOrganizationSharedJudgments(db, member.id);
    assert.equal(shared.length, 1);
    assert.equal(shared[0].id, "org-share-doc");
    assert.equal(shared[0].organizationName, "테스트 조직");
    assert.equal(getOrganizationSharedJudgments(db, outsider.id).length, 0);
  } finally {
    cleanup();
  }
});

test("review-required generations stay hidden until approved", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    seedExternalFixture(db);
    setSetting(db, "llm_provider", "OpenAI");
    setSetting(db, "llm_api_base_url", "https://llm.example/v1");
    setSetting(db, "llm_model", "test-model");
    setSetting(db, "llm_api_key", "test-key", true);
    setSetting(db, "easyread_review_required", "1");

    const judgment = getPublicJudgments(db)[0];
    const jobId = createOrAttachGenerationJob(db, judgment.id);
    const analysisJson = JSON.stringify({
      summary: "검토 대기 요약입니다.",
      easyRead: ["첫 번째 설명입니다."],
      finalResult: "결론입니다.",
    });
    globalThis.fetch = async () =>
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: analysisJson } }] })}\n\ndata: [DONE]\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );

    const result = await processGenerationJob(db, jobId);
    assert.equal(result.ok, true);

    const jobStatus = () =>
      db
        .prepare<[string], { status: string }>(
          "SELECT status FROM judgment_generation_jobs WHERE id = ?",
        )
        .get(jobId)?.status;
    assert.equal(jobStatus(), "needs_review");
    assert.equal(
      getLatestAnalysis(db, judgment.id),
      null,
      "unreviewed analysis must stay hidden",
    );

    assert.equal(await approveGenerationJob(db, jobId), true);
    assert.equal(jobStatus(), "ready");
    assert.ok(getLatestAnalysis(db, judgment.id));

    // 반려는 needs_review 상태에서만 가능하다.
    assert.equal(rejectGenerationJob(db, jobId, "이미 승인됨"), false);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("legal data reset removes collected legal records without settings", () => {
  const { db, cleanup } = withDb();
  try {
    seedExternalFixture(db);
    setSetting(db, "llm_provider", "OpenAI");
    setSetting(db, "judgment_collection_status", "success");
    db.prepare(
      `INSERT INTO dictionary_terms
        (id, source, priority, word, sense_no, definition, raw_json, updated_at)
        VALUES ('legal_reset_term', 'legal', 0, '계약', '1', '법률 용어', '{}', ?)`,
    ).run(new Date().toISOString());

    const result = resetLegalData(db);

    assert.equal(getPublicJudgments(db).length, 0);
    assert.equal(
      db
        .prepare<[], { count: number }>(
          "SELECT COUNT(*) count FROM dictionary_terms",
        )
        .get()?.count,
      0,
    );
    assert.equal(getSetting(db, "llm_provider"), "OpenAI");
    assert.equal(getSetting(db, "judgment_collection_status"), null);
    assert.ok(result.deleted.judgments >= 3);
  } finally {
    cleanup();
  }
});

test("judgment bookmarks are scoped to accessible user documents", () => {
  const { db, cleanup } = withDb();
  try {
    const [publicJudgmentId] = seedExternalFixture(db);
    const user = ensureUser(db, "bookmark@example.com");
    const otherUser = ensureUser(db, "other-bookmark@example.com");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO judgments
        (id, case_number, court_name, decided_on, title, case_type, status,
         visibility, source_provider, source_external_id, source_trust,
         created_by_user_id, created_at, updated_at)
       VALUES ('private-bookmark-test', '사용자 입력', '직접 입력', '2026-01-01',
         '내 비공개 문서', 'custom', 'pending', 'private', 'user-paste',
         'private-bookmark-test', 'user_uploaded', ?, ?, ?)`,
    ).run(user.id, now, now);
    setJudgmentText(db, "private-bookmark-test", "본문");

    assert.deepEqual(
      addJudgmentBookmark(db, {
        judgmentId: publicJudgmentId,
        userId: user.id,
      }),
      { ok: true },
    );
    assert.deepEqual(
      addJudgmentBookmark(db, {
        judgmentId: "private-bookmark-test",
        userId: user.id,
      }),
      { ok: true },
    );
    assert.deepEqual(
      addJudgmentBookmark(db, {
        judgmentId: "private-bookmark-test",
        userId: otherUser.id,
      }),
      { ok: false, reason: "not_found" },
    );

    assert.equal(
      isJudgmentBookmarked(db, {
        judgmentId: publicJudgmentId,
        userId: user.id,
      }),
      true,
    );
    assert.deepEqual(
      listBookmarkedJudgmentIds(db, user.id).sort(),
      ["private-bookmark-test", publicJudgmentId].sort(),
    );
    assert.equal(listUserBookmarkRows(db, user.id).length, 2);

    removeJudgmentBookmark(db, {
      judgmentId: publicJudgmentId,
      userId: user.id,
    });
    assert.equal(
      isJudgmentBookmarked(db, {
        judgmentId: publicJudgmentId,
        userId: user.id,
      }),
      false,
    );
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

test("open law parser normalizes administrative rules and ordinances", () => {
  const administrativeRules = parseOpenLawSearchResponse(
    {
      AdmRulSearch: {
        admrul: [
          {
            발령번호: "2026-12",
            시행일자: "20260702",
            소관부처명: "교육부",
            제개정구분명: "일부개정",
            행정규칙ID: "ADM001",
            행정규칙명: "학교 안전 고시",
            행정규칙상세링크: "/DRF/lawService.do?target=admrul&ID=ADM001",
            행정규칙종류: "고시",
          },
        ],
      },
    },
    "admrul",
  );
  const ordinances = parseOpenLawSearchResponse(
    {
      OrdinSearch: {
        ordin: [
          {
            공포번호: "55",
            시행일자: "20260703",
            자치법규ID: "ORD001",
            자치법규명: "청소년 보호 조례",
            자치법규상세링크: "/DRF/lawService.do?target=ordin&ID=ORD001",
            자치법규종류: "조례",
            지자체기관명: "서울특별시",
          },
        ],
      },
    },
    "ordin",
  );

  assert.deepEqual(
    {
      caseNumber: administrativeRules[0]?.caseNumber,
      caseType: administrativeRules[0]?.caseType,
      courtName: administrativeRules[0]?.courtName,
      sourceProvider: administrativeRules[0]?.sourceProvider,
      summary: administrativeRules[0]?.summary,
    },
    {
      caseNumber: "행정규칙 ADM001-2026-12",
      caseType: "law",
      courtName: "교육부",
      sourceProvider: "open-law-administrative-rule",
      summary: "고시 / 일부개정",
    },
  );
  assert.deepEqual(
    {
      caseNumber: ordinances[0]?.caseNumber,
      courtName: ordinances[0]?.courtName,
      sourceProvider: ordinances[0]?.sourceProvider,
      title: ordinances[0]?.title,
    },
    {
      caseNumber: "자치법규 ORD001-55",
      courtName: "서울특별시",
      sourceProvider: "open-law-ordinance",
      title: "청소년 보호 조례",
    },
  );
});

test("judgment collection resumes an interrupted run from its cursor", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "open_law_oc", "test-oc");
    const staleProgressAt = new Date(Date.now() - 5 * 60_000).toISOString();
    db.prepare(
      `INSERT INTO judgment_collection_runs
        (id, trigger, status, query, display, started_at, imported_count,
          created_count, updated_count, cursor_target, cursor_page,
          last_progress_at)
       VALUES ('resume-test-run', 'manual', 'running', '테스트', 100, ?, 3, 3, 0,
         'prec', 2, ?)`,
    ).run(staleProgressAt, staleProgressAt);

    const requestedPages: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const target = url.searchParams.get("target") ?? "prec";
      if (url.pathname.endsWith("/lawService.do")) {
        return new Response(
          JSON.stringify({ PrecService: { 판례내용: "이어받은 상세 본문" } }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }
      const page = url.searchParams.get("page") ?? "1";
      requestedPages.push(`${target}:${page}`);
      if (target !== "prec") {
        return new Response(JSON.stringify({}), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      const prec =
        page === "2"
          ? [
              {
                caseNumber: "2026Da2001",
                courtName: "Supreme Court",
                decidedOn: "20260703",
                detailLink: "/DRF/lawService.do?target=prec&ID=resume-1",
                precSeq: "resume-1",
                title: "Resumed collection judgment",
              },
            ]
          : [];
      return new Response(JSON.stringify({ PrecSearch: { prec } }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    };

    const result = await runJudgmentCollection(db, { trigger: "manual" });
    assert.ok(result.ok);
    assert.equal(result.runId, "resume-test-run");
    // 이전 run의 누계(3)에 이어받은 1건이 더해져야 한다.
    assert.equal(result.importedCount, 4);
    assert.ok(
      !requestedPages.includes("prec:1"),
      "resume must not restart from page 1",
    );
    assert.ok(requestedPages.includes("prec:2"));

    const stored = db
      .prepare<[], { status: string; imported_count: number }>(
        "SELECT status, imported_count FROM judgment_collection_runs WHERE id = 'resume-test-run'",
      )
      .get();
    assert.equal(stored?.status, "success");
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("the MCP endpoint serves corpus search and document tools", async () => {
  const { db, cleanup } = withDb();
  try {
    seedExternalFixture(db);

    const initialized = await handleMcpRequest(db, {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    });
    assert.equal(initialized.kind, "json");
    assert.ok(initialized.kind === "json");
    const initResult = initialized.body.result as {
      serverInfo: { name: string };
    };
    assert.equal(initResult.serverInfo.name, "easylaw-legal-corpus");

    const listed = await handleMcpRequest(db, {
      id: 2,
      jsonrpc: "2.0",
      method: "tools/list",
    });
    assert.ok(listed.kind === "json");
    const toolNames = (
      listed.body.result as { tools: Array<{ name: string }> }
    ).tools.map((tool) => tool.name);
    assert.deepEqual(toolNames.sort(), [
      "calculate",
      "calculate_date",
      "get_legal_document",
      "search_basic_korean_dictionary",
      "search_laws",
      "search_legal_corpus",
      "search_legal_terms",
      "search_standard_korean_dictionary",
    ]);

    const searched = await handleMcpRequest(db, {
      id: 3,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: { caseType: "civil", limit: 2, query: "손해배상" },
        name: "search_legal_corpus",
      },
    });
    assert.ok(searched.kind === "json");
    const searchResult = searched.body.result as {
      isError: boolean;
      structuredContent: {
        records: Array<{ documentId: string; title: string }>;
      };
    };
    assert.equal(searchResult.isError, false);
    assert.ok(
      searchResult.structuredContent.records.some((record) =>
        record.title.includes("손해배상"),
      ),
    );
    assert.ok(searchResult.structuredContent.records[0]?.documentId);
    assert.equal(searchResult.structuredContent.records.length <= 2, true);

    const calculated = await handleMcpRequest(db, {
      id: 31,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: { expression: "(1200000 * 0.03) / 12" },
        name: "calculate",
      },
    });
    assert.ok(calculated.kind === "json");
    const calculateResult = calculated.body.result as {
      isError: boolean;
      structuredContent: { result: number };
    };
    assert.equal(calculateResult.isError, false);
    assert.equal(calculateResult.structuredContent.result, 3000);

    const dateCalculated = await handleMcpRequest(db, {
      id: 32,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          amount: 14,
          date: "2026-07-04",
          operation: "add_days",
        },
        name: "calculate_date",
      },
    });
    assert.ok(dateCalculated.kind === "json");
    const dateResult = dateCalculated.body.result as {
      isError: boolean;
      structuredContent: { resultDate: string };
    };
    assert.equal(dateResult.isError, false);
    assert.equal(dateResult.structuredContent.resultDate, "2026-07-18");

    const holidayChecked = await handleMcpRequest(db, {
      id: 33,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: { date: "2026-03-02", operation: "is_holiday" },
        name: "calculate_date",
      },
    });
    assert.ok(holidayChecked.kind === "json");
    const holidayResult = holidayChecked.body.result as {
      isError: boolean;
      structuredContent: { holidayNames: string[]; isHoliday: boolean };
    };
    assert.equal(holidayResult.isError, false);
    assert.equal(holidayResult.structuredContent.isHoliday, true);
    assert.ok(
      holidayResult.structuredContent.holidayNames.some((name) =>
        name.includes("대체공휴일"),
      ),
    );

    const quarterListed = await handleMcpRequest(db, {
      id: 34,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: { operation: "list_quarter", quarter: 1, year: 2026 },
        name: "calculate_date",
      },
    });
    assert.ok(quarterListed.kind === "json");
    const quarterResult = quarterListed.body.result as {
      isError: boolean;
      structuredContent: {
        holidays: Array<{ date: string }>;
        weekends: Array<{ date: string }>;
      };
    };
    assert.equal(quarterResult.isError, false);
    assert.ok(
      quarterResult.structuredContent.holidays.some(
        (holiday) => holiday.date === "2026-03-02",
      ),
    );
    assert.ok(quarterResult.structuredContent.weekends.length > 0);

    const fetched = await handleMcpRequest(db, {
      id: 4,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: { identifier: "2023구합54112" },
        name: "get_legal_document",
      },
    });
    assert.ok(fetched.kind === "json");
    const documentResult = fetched.body.result as {
      isError: boolean;
      structuredContent: { caseNumber: string; originalText: string | null };
    };
    assert.equal(documentResult.isError, false);
    assert.equal(documentResult.structuredContent.caseNumber, "2023구합54112");
    assert.match(
      documentResult.structuredContent.originalText ?? "",
      /영업정지/,
    );

    // 알림은 202로 수신만 확인한다.
    const notified = await handleMcpRequest(db, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    assert.deepEqual(notified, { kind: "empty", status: 202 });
  } finally {
    cleanup();
  }
});

test("research options require structured detail and dictionary-grounded plain language", () => {
  const detailed = answerFormatInstruction({
    answerDetail: "detailed",
    easyExplanation: true,
  });
  assert.match(detailed, /육하원칙/);
  assert.match(detailed, /누가·언제·어디서·무엇을·어떻게·왜/);
  assert.match(detailed, /추가 설명/);
  assert.match(detailed, /사전·법령용어 도구/);

  const simple = answerFormatInstruction({
    answerDetail: "simple",
    easyExplanation: false,
  });
  assert.match(simple, /줄글 6~10문장/);
  assert.doesNotMatch(simple, /육하원칙 표/);
});

test("local research tools expose collected legal, basic, and standard dictionaries", async () => {
  const { db, cleanup } = withDb();
  try {
    const updatedAt = "2026-07-04T00:00:00.000Z";
    db.prepare(
      `INSERT INTO dictionary_terms
        (id, source, priority, word, sense_no, definition, raw_json, updated_at)
       VALUES
        ('dict_legal_tool', 'legal', 0, '기판력', '1', '확정된 재판의 판단이 다시 다투어지지 않는 효력', '{}', ?),
        ('dict_basic_tool', 'basic', 1, '재판', '1', '법원에서 옳고 그름을 판단하는 일', '{}', ?),
        ('dict_standard_tool', 'standard', 2, '판단', '1', '사물을 인식하여 결론을 내림', '{}', ?)`,
    ).run(updatedAt, updatedAt, updatedAt);

    const toolbox = createLocalLegalToolbox(db);
    assert.ok(
      toolbox.tools.some((tool) => tool.key === "local-legal/search_laws"),
    );
    for (const [toolKey, query] of [
      ["local-dictionary/search_legal_terms", "기판력"],
      ["local-dictionary/search_basic_korean_dictionary", "재판"],
      ["local-dictionary/search_standard_korean_dictionary", "판단"],
    ]) {
      const result = await toolbox.call(toolKey, { query });
      const records = (result.structuredContent as { records: unknown[] })
        .records;
      assert.equal(records.length, 1);
    }
    await toolbox.close();
  } finally {
    cleanup();
  }
});

test("date MCP tool caches data.go.kr holiday API responses", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "data_go_kr_api_key", "test-service-key", true);
    let requestCount = 0;
    globalThis.fetch = async (input) => {
      requestCount += 1;
      const url = new URL(String(input));
      const year = url.searchParams.get("solYear");
      const month = url.searchParams.get("solMonth");
      const body =
        year === "2026" && month === "03"
          ? `<?xml version="1.0" encoding="UTF-8"?>
            <response><header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>
            <body><items><item><dateName>삼일절 대체공휴일</dateName><locdate>20260302</locdate><isHoliday>Y</isHoliday></item></items></body></response>`
          : `<?xml version="1.0" encoding="UTF-8"?>
            <response><header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>
            <body><items></items></body></response>`;
      return new Response(body, {
        headers: { "Content-Type": "application/xml" },
        status: 200,
      });
    };

    const first = await handleMcpRequest(db, {
      id: 41,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: { date: "2026-03-02", operation: "is_holiday" },
        name: "calculate_date",
      },
    });
    assert.ok(first.kind === "json");
    const firstResult = first.body.result as {
      structuredContent: { holidayNames: string[]; isHoliday: boolean };
    };
    assert.equal(firstResult.structuredContent.isHoliday, true);
    assert.deepEqual(firstResult.structuredContent.holidayNames, [
      "삼일절 대체공휴일",
    ]);
    assert.ok(requestCount > 0);

    const countAfterFirst = requestCount;
    const second = await handleMcpRequest(db, {
      id: 42,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: { date: "2026-03-02", operation: "is_holiday" },
        name: "calculate_date",
      },
    });
    assert.ok(second.kind === "json");
    assert.equal(requestCount, countAfterFirst);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
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
      if (target === "admrul") {
        return new Response(JSON.stringify({ AdmRulSearch: { admrul: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (target === "ordin") {
        return new Response(JSON.stringify({ OrdinSearch: { ordin: [] } }), {
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
      "admrul:1",
      "ordin:1",
    ]);
    assert.deepEqual(requestedDetails, ["prec:auto-1", "prec:auto-2"]);
    assert.deepEqual(requestedQueries, [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
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
    assert.equal(runs[0]?.query, "전체 판례·헌재·법령·행정규칙·자치법규");
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
      if (target === "admrul") {
        return new Response(JSON.stringify({ AdmRulSearch: { admrul: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (target === "ordin") {
        return new Response(JSON.stringify({ OrdinSearch: { ordin: [] } }), {
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
    assert.deepEqual(requestedSearches, [
      "prec:1",
      "detc:1",
      "law:1",
      "admrul:1",
      "ordin:1",
    ]);
    assert.deepEqual(requestedDetails, ["prec:auto-3"]);
    assert.deepEqual(requestedQueries, [null, null, null, null, null]);
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

test("judgment collection hydrates page records in parallel", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "open_law_oc", "test-oc");
    let activeDetails = 0;
    let maxActiveDetails = 0;
    const requestedDetails: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const target = url.searchParams.get("target") ?? "prec";
      if (url.pathname.endsWith("/lawService.do")) {
        activeDetails += 1;
        maxActiveDetails = Math.max(maxActiveDetails, activeDetails);
        const id = url.searchParams.get("ID") ?? "";
        requestedDetails.push(id);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeDetails -= 1;
        return new Response(
          JSON.stringify({ PrecService: { 판례내용: `병렬 상세 본문 ${id}` } }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }

      if (target !== "prec") {
        return new Response(JSON.stringify({}), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      const page = url.searchParams.get("page") ?? "1";
      const prec =
        page === "1"
          ? Array.from({ length: 5 }, (_, index) => {
              const id = `parallel-${index + 1}`;
              return {
                caseNumber: `2026Da30${index + 1}`,
                courtName: "Supreme Court",
                decidedOn: "20260704",
                detailLink: `/DRF/lawService.do?target=prec&ID=${id}`,
                precSeq: id,
                title: `Parallel collection judgment ${index + 1}`,
              };
            })
          : [];
      return new Response(JSON.stringify({ PrecSearch: { prec } }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    };

    const result = await runJudgmentCollection(db, {
      forceRefresh: true,
      trigger: "manual",
    });

    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.importedCount, 5);
    assert.equal(requestedDetails.length, 5);
    assert.ok(
      maxActiveDetails > 1,
      "detail hydration should not run one record at a time",
    );
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("manual judgment collection refreshes existing public laws", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "open_law_oc", "test-oc");
    let lawVersion = 1;
    const requestedDetails: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const target = url.searchParams.get("target") ?? "prec";
      if (url.pathname.endsWith("/lawService.do")) {
        requestedDetails.push(`${target}:${url.searchParams.get("ID")}`);
        return new Response(
          JSON.stringify({
            LawService: {
              법령내용:
                lawVersion === 1 ? "민법 첫 수집 본문" : "민법 개정 반영 본문",
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (target === "prec") {
        return new Response(JSON.stringify({ PrecSearch: { prec: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (target === "detc") {
        return new Response(JSON.stringify({ DetcSearch: { detc: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (target === "admrul") {
        return new Response(JSON.stringify({ AdmRulSearch: { admrul: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (target === "ordin") {
        return new Response(JSON.stringify({ OrdinSearch: { ordin: [] } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      const page = url.searchParams.get("page") ?? "1";
      const law =
        page === "1"
          ? [
              {
                공포번호: lawVersion === 1 ? "456" : "457",
                법령ID: "001234",
                법령구분명: "법률",
                법령명한글: lawVersion === 1 ? "민법" : "민법 일부개정",
                법령상세링크: "/DRF/lawService.do?target=law&ID=001234",
                시행일자: lawVersion === 1 ? "20260702" : "20260801",
                소관부처명: "법무부",
                제개정구분명: lawVersion === 1 ? "제정" : "일부개정",
              },
            ]
          : [];
      return new Response(JSON.stringify({ LawSearch: { law } }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    };

    const firstResult = await runJudgmentCollection(db, {
      forceRefresh: true,
      trigger: "manual",
    });
    assert.equal(firstResult.ok, true);
    assert.ok(firstResult.ok);
    assert.equal(firstResult.createdCount, 1);
    assert.equal(firstResult.updatedCount, 0);

    lawVersion = 2;
    const secondResult = await runJudgmentCollection(db, {
      forceRefresh: true,
      trigger: "manual",
    });
    assert.equal(secondResult.ok, true);
    assert.ok(secondResult.ok);
    assert.equal(secondResult.createdCount, 0);
    assert.equal(secondResult.updatedCount, 1);
    assert.deepEqual(requestedDetails, ["law:001234", "law:001234"]);

    const lawJudgment = getPublicJudgments(db).find(
      (judgment) => judgment.sourceProvider === "open-law-law",
    );
    assert.equal(lawJudgment?.caseNumber, "법령 001234-457");
    assert.equal(lawJudgment?.title, "민법 일부개정");
    assert.equal(lawJudgment?.decidedOn, "2026-08-01");
    const detail = getPublicJudgmentByIdentifier(db, lawJudgment?.id ?? "");
    assert.equal(detail?.originalText, "민법 개정 반영 본문");
    assert.equal(detail?.sourceSummary, "법률 / 일부개정");
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

test("safe next paths reject external or ambiguous redirects", () => {
  assert.equal(safeNextPath("/catalog?q=recent#top"), "/catalog?q=recent#top");
  assert.equal(optionalSafeNextPath("/security"), "/security");
  assert.equal(safeNextPath("https://evil.example/login"), "/");
  assert.equal(safeNextPath("//evil.example/login"), "/");
  assert.equal(safeNextPath("/\\evil.example/login"), "/");
  assert.equal(safeNextPath("/admin\u0000/settings"), "/");
  assert.equal(optionalSafeNextPath("https://evil.example/login"), undefined);
});

test("legal research harness assigns coverage and evidence", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "llm_provider", "OpenAI");
    setSetting(db, "llm_api_base_url", "https://llm.example/v1");
    setSetting(db, "llm_model", "test-model");
    setSetting(db, "llm_api_key", "test-key", true);
    setSetting(db, "mcp_korean_law_endpoint", "https://mcp.example/mcp");
    const mock = createResearchFetchMock({
      llmResponses: [
        // 1) 검색과 병렬로 즉시 스트리밍되는 초안
        "일반적으로 판매자가 대금을 받고 잠적한 경우 민사상 손해배상 청구를 검토할 수 있습니다.",
        // 2) 검색 결과로 초안을 보정하는 근거 확인 섹션
        "입금 내역과 대화 기록으로 기망을 입증할 수 있다는 점이 판례로 확인됩니다. [E1]",
      ],
      toolResults: [
        {
          caseNumber: "2024가단100",
          source: "서울중앙지방법원",
          summary: "중고거래 사기의 손해배상 책임과 입증 자료를 판단했다.",
          title: "중고거래 사기 손해배상",
          url: "https://example.test/judgment/1",
        },
      ],
    });
    globalThis.fetch = mock.fetch;
    const events: ResearchHarnessEvent[] = [];

    const plan = await buildResearchPlan(
      db,
      "중고거래 판매자에게 입금했는데 잠적했습니다. 손해배상을 받을 수 있나요?",
      (event) => events.push(event),
    );

    assert.equal(plan.mode, "overview");
    assert.equal(plan.coverageLevel, 2);
    assert.ok(
      plan.evidence.some(
        (item) =>
          item.id === "E1" &&
          item.title.includes("2024가단100") &&
          item.url === "https://example.test/judgment/1",
      ),
      JSON.stringify(plan.evidence),
    );
    // 간단 답변은 별도 제목 없이 초안과 근거 확인 문단이 이어진다.
    assert.match(plan.answer, /민사상 손해배상 청구/);
    assert.doesNotMatch(plan.answer, /## 근거 확인/);
    assert.match(plan.answer, /\[E1\]/);
    // LLM 호출은 초안·근거확인 딱 2번뿐이다(계획 JSON 호출 없음).
    assert.equal(mock.state.llmRequests, 2);
    assert.equal(mock.state.toolCalls, 1);
    assert.ok(
      mock.state.llmBodies.every((body) => body.stream === true),
      "all research requests should stream",
    );
    assert.ok(
      mock.state.llmBodies.every((body) => !("reasoning" in body)),
      "research requests should not force reasoning mode",
    );
    const skillEvents = events
      .filter((event) => event.type === "skill")
      .map((event) => event.skill);
    assert.ok(
      skillEvents.some(
        (event) =>
          event.key === "summarize_question" && event.stage === "completed",
      ),
    );
    assert.ok(
      skillEvents.some(
        (event) =>
          event.key === "retrieve_evidence" && event.stage === "completed",
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

function sseChatResponse(content: string) {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

test("ollama requests disable reasoning for thinking models", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  try {
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return sseChatResponse("빠른 답변");
    };

    const response = await requestLlmText(
      {
        apiKey: null,
        baseUrl: "http://localhost:11434/v1",
        model: "gemma4",
        provider: "Ollama",
        totalTimeoutMs: 10_000,
      },
      [{ content: "상계가 무슨 뜻인가요?", role: "user" }],
    );

    assert.equal(response, "빠른 답변");
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0]?.reasoning_effort, "none");
    assert.equal(bodies[0]?.stream, true);
    assert.equal("reasoning" in (bodies[0] ?? {}), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("llm responses never expose tagged reasoning, including streamed tags", async () => {
  const originalFetch = globalThis.fetch;
  const streamed: string[] = [];
  try {
    globalThis.fetch = async () =>
      new Response(
        [
          `data: ${JSON.stringify({ choices: [{ delta: { content: "<tho" } }] })}`,
          `data: ${JSON.stringify({ choices: [{ delta: { content: "ught>내부 추론" } }] })}`,
          `data: ${JSON.stringify({ choices: [{ delta: { content: "</thought>사용자 답변" } }] })}`,
          "data: [DONE]",
          "",
        ].join("\n\n"),
        { headers: { "Content-Type": "text/event-stream" } },
      );

    const response = await requestLlmText(
      {
        apiKey: null,
        baseUrl: "http://localhost:1234/v1",
        model: "local-model",
        provider: "LM Studio",
        totalTimeoutMs: 10_000,
      },
      [{ content: "질문", role: "user" }],
      { onToken: (token) => streamed.push(token) },
    );

    assert.equal(response, "사용자 답변");
    assert.equal(streamed.join(""), "사용자 답변");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lm studio requests also ask compatible servers to disable reasoning", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  try {
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return sseChatResponse("답변");
    };

    await requestLlmText(
      {
        apiKey: null,
        baseUrl: "http://localhost:1234/v1",
        model: "local-model",
        provider: "LM Studio",
        totalTimeoutMs: 10_000,
      },
      [{ content: "질문", role: "user" }],
    );

    assert.equal(bodies[0]?.reasoning_effort, "none");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("openai-compatible requests retry without reasoning control when rejected", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  try {
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) {
        return Response.json(
          { error: "unsupported reasoning_effort" },
          { status: 400 },
        );
      }
      return sseChatResponse("재시도 답변");
    };

    const response = await requestLlmText(
      {
        apiKey: null,
        baseUrl: "http://localhost:11434/v1",
        model: "gemma4",
        provider: "Ollama",
        totalTimeoutMs: 10_000,
      },
      [{ content: "상계가 무슨 뜻인가요?", role: "user" }],
    );

    assert.equal(response, "재시도 답변");
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0]?.reasoning_effort, "none");
    assert.equal("reasoning_effort" in (bodies[1] ?? {}), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hypothetical legal scenarios keep their premise and require MCP-grounded analysis", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "llm_provider", "OpenAI");
    setSetting(db, "llm_api_base_url", "https://llm.example/v1");
    setSetting(db, "llm_model", "test-model");
    setSetting(db, "llm_api_key", "test-key", true);
    setSetting(db, "mcp_korean_law_endpoint", "https://mcp.example/mcp");
    const assumptions = [
      "엘프는 지능과 의사능력이 있고 인간과 같은 생명·신체를 가진다.",
      "마력 소진은 즉시 처치가 필요한 응급증상을 일으킨다.",
    ];
    const legalIssues = [
      "응급환자 해당성",
      "응급의료 종사자의 진료 의무와 정당한 사유",
      "진료 거부의 벌칙과 행정처분",
      "치료 포기에 따른 부작위 형사책임",
    ];
    const groundedAnswer = `엘프를 인간과 같은 생명·신체를 가진 응급환자로 대응시키면, 단순히 종족을 보고 치료를 포기한 의사는 정당한 사유 없는 응급의료 거부에 따른 처벌 가능성이 높습니다. [E1] 관련 벌칙과 행정처분도 검토해야 합니다. [E2] 사망이나 중상해가 발생했다면 보호의무와 인과관계에 따라 부작위 형사책임도 별도로 문제 됩니다. [E3] 다만 응급증상과 치료 가능성은 의료 자료로 확인해야 합니다. [E4]`;
    const mock = createResearchFetchMock({
      llmResponses: [
        "응급상황에서는 환자 지위와 진료 거부 사유를 먼저 확인해야 합니다.",
        JSON.stringify({
          answer:
            "엘프는 자연인이 아니므로 현실의 법으로 의사를 처벌할 수 없습니다.",
          assumptions,
          coverageLevel: 4,
          hypothetical: true,
          intent: "가상 응급환자에 대한 치료 포기의 법적 책임 확인",
          legalIssues,
          mode: "deep",
          type: "answer",
        }),
        JSON.stringify({
          assumptions,
          calls: [
            {
              arguments: { query: "응급의료법 응급환자 정의" },
              toolKey: "korean-law/search_law",
            },
            {
              arguments: { query: "응급의료법 진료 거부 정당한 사유 벌칙" },
              toolKey: "korean-law/search_law",
            },
            {
              arguments: { query: "의사 치료 거부 부작위 살인 판례" },
              toolKey: "korean-law/search_law",
            },
            {
              arguments: { query: "응급의료 진료 거부 행정처분" },
              toolKey: "korean-law/search_law",
            },
          ],
          coverageLevel: 4,
          hypothetical: true,
          intent: "가상 응급환자에 대한 치료 포기의 법적 책임 확인",
          legalIssues,
          mode: "deep",
          type: "tool_calls",
        }),
        JSON.stringify({
          answer: groundedAnswer,
          assumptions,
          coverageLevel: 4,
          hypothetical: true,
          intent: "가상 응급환자에 대한 치료 포기의 법적 책임 확인",
          legalIssues,
          mode: "deep",
          type: "answer",
        }),
        "엘프를 인간과 같은 생명·신체를 가진 응급환자로 대응시키면, 단순히 종족을 보고 치료를 포기한 의사는 정당한 사유 없는 응급의료 거부에 따른 처벌 가능성이 높습니다. [E1]",
        "응급의료 거부 금지와 벌칙·행정처분 근거가 함께 문제 되고, 사망이나 중상해가 발생했다면 보호의무와 인과관계에 따라 부작위 형사책임도 별도로 검토해야 합니다. [E2] [E3]",
        "다만 마력 소진이 응급증상에 대응되는지, 당시 치료 가능성과 전원 가능성이 있었는지는 의료 자료로 확인해야 합니다. [E4]",
        JSON.stringify({
          answer: groundedAnswer,
          grounded: true,
          issues: [],
        }),
      ],
      toolResults: [
        {
          source: "국가법령정보센터",
          summary: "응급환자의 정의와 응급증상 기준",
          title: "응급의료에 관한 법률 제2조",
          url: "https://example.test/law/emergency-definition",
        },
        {
          source: "국가법령정보센터",
          summary: "응급의료 거부 금지와 벌칙",
          title: "응급의료에 관한 법률 진료 거부 및 벌칙",
          url: "https://example.test/law/emergency-penalty",
        },
        {
          caseNumber: "2000도0000",
          source: "대법원",
          summary: "보증인 지위와 부작위범의 성립 요건",
          title: "부작위 형사책임 판결",
          url: "https://example.test/judgment/omission",
        },
        {
          source: "보건복지부",
          summary: "응급의료 거부 관련 행정처분 기준",
          title: "의료관계 행정처분 규칙",
          url: "https://example.test/rule/medical-sanction",
        },
      ],
    });
    globalThis.fetch = mock.fetch;
    const events: ResearchHarnessEvent[] = [];

    const result = await buildResearchPlan(
      db,
      "엘프가 마력을 다 소진한 채 응급실에 실려왔는데 의사가 엘프를 보자마자 치료를 포기했습니다. 의사는 처벌을 받나요?",
      (event) => events.push(event),
    );

    assert.equal(result.hypothetical, true);
    assert.deepEqual(result.assumptions, assumptions);
    assert.deepEqual(result.legalIssues, legalIssues);
    const planEvents = events.filter((event) => event.type === "plan");
    assert.ok(planEvents.length > 0);
    assert.ok(
      planEvents.every(
        (event) =>
          event.type === "plan" &&
          event.plan.intent ===
            "가상 응급환자에 대한 치료 포기의 법적 책임 확인",
      ),
    );
    assert.ok(
      events.every(
        (event) =>
          event.type !== "plan" ||
          !event.plan.intent.includes("고위험 법률 상황 검토"),
      ),
    );
    assert.equal(mock.state.toolCalls, 4);
    assert.equal(
      new Set(mock.state.toolArguments.map((value) => JSON.stringify(value)))
        .size,
      4,
    );
    assert.equal(mock.state.llmRequests, 8);
    assert.doesNotMatch(result.answer, /자연인이 아니므로.*처벌할 수 없습니다/);
    assert.match(result.answer, /처벌 가능성이 높습니다/);
    assert.match(result.answer, /\[E1\]/);

    const agentPrompt = mock.state.llmBodies.find((body) =>
      JSON.stringify(body).includes(
        "가상·초현실적 사실도 질문자가 정한 사실로 받아들인다",
      ),
    );
    assert.ok(agentPrompt);
    assert.match(
      JSON.stringify(agentPrompt),
      /가상·초현실적 사실도 질문자가 정한 사실로 받아들인다/,
    );
    assert.match(
      JSON.stringify(agentPrompt),
      /포션.*약사법 쟁점으로 단정하지 않는다/,
    );
    const rejectedPrompt = mock.state.llmBodies.find((body) =>
      JSON.stringify(body).includes("MCP 근거가 하나도 없다"),
    );
    assert.ok(rejectedPrompt);
    assert.match(JSON.stringify(rejectedPrompt), /MCP 근거가 하나도 없다/);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("deep research keeps its overview when verification fails", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "llm_provider", "OpenAI");
    setSetting(db, "llm_api_base_url", "https://llm.example/v1");
    setSetting(db, "llm_model", "test-model");
    setSetting(db, "llm_api_key", "test-key", true);
    setSetting(db, "mcp_korean_law_endpoint", "https://mcp.example/mcp");
    const mock = createResearchFetchMock({
      llmResponses: [
        "형사 절차 질문이므로 자료 보존과 신고 경로를 먼저 정리해야 합니다.",
        JSON.stringify({
          calls: [
            {
              arguments: { query: "사기 형사 절차" },
              toolKey: "korean-law/search_law",
            },
            {
              arguments: { query: "사기 피해 긴급 증거 보전" },
              toolKey: "korean-law/search_law",
            },
          ],
          coverageLevel: 4,
          intent: "형사 절차와 긴급 대응 확인",
          mode: "deep",
          type: "tool_calls",
        }),
        JSON.stringify({
          answer:
            "현재 확보한 자료를 보존하고 수사기관 상담을 준비하세요. [E1]",
          coverageLevel: 4,
          intent: "형사 절차와 긴급 대응 확인",
          mode: "deep",
          type: "answer",
        }),
        "현재 확보한 자료를 보존하고 수사기관 상담을 준비하세요. [E1]",
        "사기죄의 구성요건과 신고 절차는 피해 자료의 내용에 따라 달라지므로 송금 내역과 대화 기록을 먼저 정리해야 합니다. [E1] [E2]",
        "긴급성이 크다면 추가 송금을 멈추고 플랫폼·수사기관 상담 경로를 병행하세요. [E2]",
        "검증 결과를 JSON으로 만들지 못했습니다.",
      ],
      toolResults: [
        {
          source: "국가법령정보센터",
          summary: "사기죄의 구성요건과 형사 절차 안내",
          title: "형법 사기죄",
          url: "https://example.test/law/fraud",
        },
        {
          source: "경찰청",
          summary: "사기 피해 신고와 증거 보전 안내",
          title: "사기 피해 대응 절차",
          url: "https://example.test/guide/fraud",
        },
      ],
    });
    globalThis.fetch = mock.fetch;
    const events: string[] = [];

    const result = await buildResearchPlan(
      db,
      "사기 피해로 긴급하게 형사 절차를 확인해야 합니다.",
      (event) => events.push(event.type),
    );

    assert.match(result.answer, /자료를 보존/);
    assert.ok(events.includes("answer"));
    assert.ok(events.includes("warning"));
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("deep research falls back to the overview path when the model breaks the JSON contract", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    seedExternalFixture(db);
    setSetting(db, "llm_provider", "Ollama");
    setSetting(db, "llm_api_base_url", "https://llm.example/v1");
    setSetting(db, "llm_model", "gemma4");
    const mock = createResearchFetchMock({
      llmResponses: [
        "고위험 쟁점이지만 먼저 일반적인 법적 방향을 요약합니다.",
        // 심층 검증 결정이 JSON이 아니어도 오류로 끝나면 안 된다.
        "죄송하지만 JSON 형식으로 답변드리기 어렵습니다.",
        "일반적으로 무면허 운전은 도로교통법 위반으로 다뤄질 수 있습니다.",
        "관련 판례에서 처벌 기준이 확인됩니다. [E1]",
      ],
    });
    globalThis.fetch = mock.fetch;

    const warnings: string[] = [];
    const result = await buildResearchPlan(
      db,
      "영업정지 처분을 받았는데 형사 처벌도 받나요?",
      (event) => {
        if (event.type === "warning") {
          warnings.push(event.message);
        }
      },
    );

    assert.equal(result.mode, "overview");
    assert.match(result.answer, /무면허 운전|도로교통법/);
    assert.ok(warnings.some((message) => message.includes("일반 오버뷰")));
    // 빠른 예비 초안 + 실패한 결정 1회 + fallback 초안 + 근거 확인 = 4회.
    assert.equal(mock.state.llmRequests, 4);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("the rule-based router classifies queries without an LLM call", () => {
  // 용어·개념 질문은 quick.
  assert.equal(routeResearchQuery("상계가 무슨 뜻인가요?").mode, "quick");
  assert.equal(routeResearchQuery("기판력의 정의가 뭐야").mode, "quick");

  // 일반 상황 질문은 answer-first overview가 기본값.
  const overview = routeResearchQuery(
    "중고거래 판매자가 잠적했는데 손해배상을 받을 수 있나요?",
  );
  assert.equal(overview.mode, "overview");
  assert.ok(overview.legalIssues.includes("손해배상"));

  // 고위험(형사·소송 등) 신호는 검증 하네스(deep)로 보낸다.
  const deep = routeResearchQuery("무면허 운전으로 처벌을 받을 수 있나요?");
  assert.equal(deep.mode, "deep");
  assert.equal(deep.coverageLevel, 4);

  // 용어 패턴이 있어도 고위험 신호가 우선한다.
  assert.equal(routeResearchQuery("구속영장이 무슨 뜻인가요?").mode, "deep");

  // 가상 전제는 표시하되 모드 자체는 위험도로 정한다.
  const fantasy = routeResearchQuery(
    "엘프가 계약을 어기면 손해배상 책임이 있나요?",
  );
  assert.equal(fantasy.hypothetical, true);
  assert.equal(fantasy.mode, "overview");
});

test("simple legal concepts use the quick answer path", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "llm_provider", "OpenAI");
    setSetting(db, "llm_api_base_url", "https://llm.example/v1");
    setSetting(db, "llm_model", "test-model");
    setSetting(db, "llm_api_key", "test-key", true);
    const mock = createResearchFetchMock({
      llmResponses: [
        "상계는 서로 같은 종류의 채무를 일정 범위에서 소멸시키는 방식입니다.",
      ],
    });
    globalThis.fetch = mock.fetch;

    const result = await buildResearchPlan(db, "상계가 무슨 뜻인가요?");

    assert.equal(result.mode, "quick");
    assert.equal(result.evidence.length, 0);
    assert.match(result.answer, /서로 같은 종류의 채무/);
    assert.equal(mock.state.llmRequests, 1);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("research questions fall back to local legal data when MCP is unavailable", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    upsertJudgmentFromExternal(db, {
      caseNumber: "2024가단100",
      caseType: "civil",
      courtName: "서울중앙지방법원",
      decidedOn: "2024-02-20",
      externalId: "lease-termination-fixture",
      originalText:
        "임대차 계약 중도 해지는 계약 내용, 귀책 사유, 해지 통지 및 손해배상 범위에 따라 판단한다.",
      sourceProvider: "open-law",
      sourceUrl: "https://example.test/judgment/lease",
      summary: "전세 계약 중도 해지와 손해배상 범위를 판단했다.",
      title: "전세 계약 중도 해지 손해배상",
    });
    setSetting(db, "llm_provider", "OpenAI");
    setSetting(db, "llm_api_base_url", "https://llm.example/v1");
    setSetting(db, "llm_model", "test-model");
    setSetting(db, "llm_api_key", "test-key", true);
    const mock = createResearchFetchMock({
      llmResponses: [
        "계약 내용과 귀책 사유에 따라 중도 해지 가능성이 달라집니다.",
        "해지 통지와 손해배상 범위를 함께 검토해야 합니다. [E1]",
      ],
    });
    globalThis.fetch = mock.fetch;

    const result = await buildResearchPlan(
      db,
      "전세 계약을 중도 해지할 수 있나요?",
    );

    assert.equal(result.evidence.length, 1);
    assert.match(result.evidence[0]?.source ?? "", /국가법령정보센터 판례/);
    assert.match(result.answer, /\[E1\]/);
    // MCP 엔드포인트가 없으면 내부 코퍼스 검색만으로 근거를 채운다.
    assert.equal(mock.state.toolCalls, 0);
    assert.equal(mock.state.llmRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("local legal research returns the grounded draft without extra composition", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "llm_provider", "Ollama");
    setSetting(db, "llm_api_base_url", "https://llm.example/v1");
    setSetting(db, "llm_model", "gemma4");
    setSetting(db, "mcp_korean_law_endpoint", "https://mcp.example/mcp");
    const mock = createResearchFetchMock({
      llmResponses: [
        "당사자가 합의하면 물물교환도 계약으로 볼 여지가 있습니다.",
        "민법상 교환계약 규정이 적용될 수 있음이 확인됩니다. [E1]",
      ],
      toolResults: [
        {
          source: "국가법령정보센터",
          summary: "민법상 교환계약과 매매 규정 준용",
          title: "민법 교환",
          url: "https://example.test/law/exchange",
        },
      ],
    });
    globalThis.fetch = mock.fetch;

    const result = await buildResearchPlan(
      db,
      "고블린이 편의점에서 현금 대신 포션으로 거래하자는데 가능한가요?",
    );

    // 가상 전제여도 고위험 신호가 없으면 answer-first 오버뷰로 처리한다.
    assert.equal(result.mode, "overview");
    assert.equal(result.hypothetical, true);
    assert.match(result.answer, /교환계약/);
    // 로컬 모델도 동일하게 초안+근거확인 2회 호출로 끝난다.
    assert.equal(mock.state.llmRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("legal research harness requires configured LLM settings", async () => {
  const { db, cleanup } = withDb();
  try {
    await assert.rejects(
      buildResearchPlan(db, "계약을 해제할 수 있나요?"),
      /관리자 LLM 설정/,
    );
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

test("term explanations clearly report missing dictionary entries", () => {
  const { db, cleanup } = withDb();
  try {
    const explanation = buildTermExplanation(db, {
      context: "엘프가 마력을 다 소진한 채로 응급실에 실려왔다.",
      term: "마력소진",
    });

    assert.equal(explanation.definitions.length, 0);
    assert.equal(explanation.priority, "사전 미등록");
    assert.match(explanation.plain, /사전에 없는 단어/);
    assert.match(explanation.aiExplanation, /사전에 없는 단어/);
  } finally {
    cleanup();
  }
});

test("downloadable dictionary import processes zip entries in batches", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    const zip = zipSync({
      "first.json": Buffer.from(
        JSON.stringify([
          {
            definition: "A binding promise.",
            sense_no: "1",
            word: "contract",
          },
        ]),
      ),
      "second.json": Buffer.from(
        JSON.stringify([
          {
            definition: "A binding promise.",
            sense_no: "1",
            word: "contract",
          },
          {
            definition: "A written legal decision.",
            sense_no: "1",
            word: "judgment",
          },
        ]),
      ),
      "object.json": Buffer.from(
        JSON.stringify({
          definition: "A request for review.",
          sense_no: "1",
          word: "appeal",
        }),
      ),
      "ignored.txt": Buffer.from("not json"),
    });
    const requests: string[] = [];
    globalThis.fetch = async (input, init) => {
      requests.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response(zip, {
        headers: {
          "Content-Length": String(zip.byteLength),
          "Content-Type": "application/zip",
        },
        status: 200,
      });
    };

    const result = await updateDictionarySource(db, "basic");
    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.importedCount : 0, 3);
    const progress = getDictionaryImportProgress(db, "basic");
    assert.equal(progress?.stage, "done");
    assert.equal(progress?.status, "completed");
    assert.equal(progress?.percent, 100);
    assert.equal(progress?.importedCount, 3);
    assert.equal(progress?.current, 3);
    assert.equal(progress?.total, 3);
    assert.deepEqual(requests, [
      "GET https://krdict.korean.go.kr/dicBatchDownload?seq=208",
    ]);

    const rows = db
      .prepare<[], { definition: string; word: string }>(
        `SELECT word, definition
          FROM dictionary_terms
          WHERE source = 'basic'
          ORDER BY word`,
      )
      .all();
    assert.deepEqual(rows, [
      { definition: "A request for review.", word: "appeal" },
      { definition: "A binding promise.", word: "contract" },
      { definition: "A written legal decision.", word: "judgment" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("open law legal terms import into the priority dictionary", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "open_law_oc", "test-oc");
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const target = url.searchParams.get("target");
      if (url.pathname.endsWith("/lawSearch.do")) {
        requests.push(`search:${target}:${url.searchParams.get("page")}`);
        return new Response(
          JSON.stringify({
            LsTrmSearch: {
              lstrm:
                url.searchParams.get("page") === "1"
                  ? [
                      {
                        법령용어ID: "3945293",
                        법령용어명: "기판력",
                        사전구분코드: "011402",
                      },
                    ]
                  : [],
              totalCnt: "1",
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }
      requests.push(
        `service:${target}:${url.searchParams.get("trmSeqs") ?? ""}`,
      );
      return new Response(
        JSON.stringify({
          LsTrmService: {
            법령용어일련번호: ["3945293"],
            법령용어명_한글: ["기판력"],
            법령용어코드명: ["법률"],
            법령용어정의: ["확정된 판결의 판단을 다시 다투기 어렵게 하는 효력"],
            출처: ["민사소송법"],
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    };

    const result = await updateOpenLawLegalDictionary(db);
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.importedCount, 1);
    assert.deepEqual(requests, ["search:lstrm:1", "service:lstrm:3945293"]);

    const explanation = buildTermExplanation(db, { term: "기판력" });
    assert.equal(explanation.priority, "자체 법률 용어 사전");
    assert.equal(
      explanation.definitions[0]?.definition,
      "확정된 판결의 판단을 다시 다투기 어렵게 하는 효력",
    );
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("open law legal terms import hydrates definitions in parallel batches", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "open_law_oc", "test-oc");
    let activeDetails = 0;
    let maxActiveDetails = 0;
    const detailBatchSizes: number[] = [];
    const requestedIds: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/lawSearch.do")) {
        const lstrm = Array.from({ length: 45 }, (_, index) => ({
          법령용어ID: `legal-term-${index + 1}`,
          법령용어명: `법령용어 ${index + 1}`,
        }));
        return new Response(
          JSON.stringify({ LsTrmSearch: { lstrm, totalCnt: "45" } }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const ids = (url.searchParams.get("trmSeqs") ?? "")
        .split(",")
        .filter(Boolean);
      detailBatchSizes.push(ids.length);
      requestedIds.push(...ids);
      activeDetails += 1;
      maxActiveDetails = Math.max(maxActiveDetails, activeDetails);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeDetails -= 1;

      return new Response(
        JSON.stringify({
          LsTrmService: {
            법령용어일련번호: ids,
            법령용어명_한글: ids.map((id) => `용어 ${id}`),
            법령용어코드명: ids.map(() => "법률"),
            법령용어정의: ids.map((id) => `${id} 정의`),
            출처: ids.map(() => "민사소송법"),
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    };

    const result = await updateOpenLawLegalDictionary(db);
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.importedCount, 45);
    assert.ok(
      maxActiveDetails > 1,
      "legal term detail batches should run concurrently",
    );
    assert.deepEqual(detailBatchSizes, [20, 20, 5]);
    assert.equal(new Set(requestedIds).size, 45);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("open law legal terms import fetches list pages in parallel", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "open_law_oc", "test-oc");
    let activeListPages = 0;
    let maxActiveListPages = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/lawSearch.do")) {
        const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
        if (page > 1) {
          activeListPages += 1;
          maxActiveListPages = Math.max(maxActiveListPages, activeListPages);
          await new Promise((resolve) => setTimeout(resolve, 20));
          activeListPages -= 1;
        }
        const firstIndex = (page - 1) * 100;
        const count = page === 5 ? 1 : 100;
        const lstrm = Array.from({ length: count }, (_, index) => {
          const termIndex = firstIndex + index + 1;
          return {
            법령용어ID: `paged-legal-term-${termIndex}`,
            법령용어명: `페이지 용어 ${termIndex}`,
          };
        });
        return new Response(
          JSON.stringify({ LsTrmSearch: { lstrm, totalCnt: "401" } }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const ids = (url.searchParams.get("trmSeqs") ?? "")
        .split(",")
        .filter(Boolean);
      return new Response(
        JSON.stringify({
          LsTrmService: {
            법령용어일련번호: ids,
            법령용어명_한글: ids.map((id) => `용어 ${id}`),
            법령용어정의: ids.map((id) => `${id} 정의`),
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    };

    const result = await updateOpenLawLegalDictionary(db);
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.importedCount, 401);
    assert.ok(
      maxActiveListPages > 1,
      "legal term list pages should not be fetched one at a time",
    );
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("open law legal terms import resumes from the saved page cursor", async () => {
  const { db, cleanup } = withDb();
  const originalFetch = globalThis.fetch;
  try {
    setSetting(db, "open_law_oc", "test-oc");
    const requestedSearchPages: string[] = [];
    const requestedDetailIds: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/lawSearch.do")) {
        const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
        requestedSearchPages.push(String(page));
        const firstIndex = (page - 1) * 100;
        const count = page === 3 ? 1 : 100;
        const lstrm = Array.from({ length: count }, (_, index) => {
          const termIndex = firstIndex + index + 1;
          return {
            법령용어ID: `resume-legal-term-${termIndex}`,
            법령용어명: `재개 용어 ${termIndex}`,
          };
        });
        return new Response(
          JSON.stringify({ LsTrmSearch: { lstrm, totalCnt: "201" } }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const ids = (url.searchParams.get("trmSeqs") ?? "")
        .split(",")
        .filter(Boolean);
      requestedDetailIds.push(...ids);
      return new Response(
        JSON.stringify({
          LsTrmService: {
            법령용어일련번호: ids,
            법령용어명_한글: ids.map((id) => `용어 ${id}`),
            법령용어정의: ids.map((id) => `${id} 정의`),
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    };

    const first = await updateOpenLawLegalDictionary(db, {
      maxPagesPerSlice: 1,
    });
    assert.equal(first.ok, true);
    assert.ok(first.ok);
    assert.equal(first.done, false);
    assert.equal(first.importedCount, 100);
    assert.equal(getDictionaryImportProgress(db, "legal")?.current, 1);

    const second = await updateOpenLawLegalDictionary(db, {
      maxPagesPerSlice: 1,
    });
    assert.equal(second.ok, true);
    assert.ok(second.ok);
    assert.equal(second.done, false);
    assert.equal(second.importedCount, 200);
    assert.equal(getDictionaryImportProgress(db, "legal")?.current, 2);

    const third = await updateOpenLawLegalDictionary(db, {
      maxPagesPerSlice: 1,
    });
    assert.equal(third.ok, true);
    assert.ok(third.ok);
    assert.equal(third.done, true);
    assert.equal(third.importedCount, 201);
    assert.equal(getDictionaryImportProgress(db, "legal")?.status, "completed");
    assert.deepEqual(requestedSearchPages, ["1", "1", "2", "1", "3"]);
    assert.equal(new Set(requestedDetailIds).size, 201);
  } finally {
    globalThis.fetch = originalFetch;
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
