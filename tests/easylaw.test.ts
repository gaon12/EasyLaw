import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generate } from "otplib";
import {
  assertManagementAccess,
  consumeRecoveryCode,
  createTotpEnrollment,
  verifyTotpEnrollment,
} from "../src/lib/auth";
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
import { sendReadyNotifications } from "../src/lib/notifications";
import { getPublicJudgments } from "../src/lib/queries";
import { decryptSecret } from "../src/lib/security/crypto";

function withDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "easylaw-test-"));
  const file = path.join(dir, "test.sqlite");
  const db = createDatabase(file);
  seedDatabase(db);
  return {
    db,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("SQLite migration enables WAL and seeds beta users", () => {
  const { db, cleanup } = withDb();
  try {
    const journalMode = db.pragma("journal_mode", { simple: true });
    assert.equal(String(journalMode).toLowerCase(), "wal");
    const admin = db
      .prepare<[string], { totp_required: number }>(
        "SELECT totp_required FROM users WHERE email = ?",
      )
      .get("admin@easylaw.local");
    assert.equal(admin?.totp_required, 1);
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

test("TOTP enrollment, recovery code, and management access policy", async () => {
  const { db, cleanup } = withDb();
  try {
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
