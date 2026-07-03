import { auditLog } from "./audit";
import type { SqliteDatabase } from "./db";
import { sendReadyNotifications } from "./notifications";
import { newId } from "./security/crypto";
import { nowIso } from "./time";
import type { EasyReadAnalysis } from "./types";

export function createOrAttachGenerationJob(
  db: SqliteDatabase,
  judgmentId: string,
  email?: string,
) {
  const activeJob = db
    .prepare<[string], { id: string; status: string }>(
      `SELECT id, status
        FROM judgment_generation_jobs
        WHERE judgment_id = ?
          AND status IN ('queued', 'generating')
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get(judgmentId);

  const now = nowIso();
  const jobId = activeJob?.id ?? newId("job");

  if (!activeJob) {
    db.prepare(
      `INSERT INTO judgment_generation_jobs
        (id, judgment_id, status, requested_by_email, prompt_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      jobId,
      judgmentId,
      "queued",
      email ?? null,
      "easyread-beta-001",
      now,
      now,
    );
  }

  if (email) {
    db.prepare(
      `INSERT INTO notifications
        (id, judgment_id, job_id, email, type, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(judgment_id, email, type)
        DO UPDATE SET job_id = excluded.job_id, status = 'pending'`,
    ).run(
      newId("notice"),
      judgmentId,
      jobId,
      email.trim().toLowerCase(),
      "generation_ready",
      "pending",
      now,
    );
  }

  auditLog(db, {
    action: activeJob ? "job.attached" : "job.created",
    targetType: "generation_job",
    targetId: jobId,
    metadata: { judgmentId, email: email ?? null },
  });

  return jobId;
}

export async function completeGenerationJob(
  db: SqliteDatabase,
  jobId: string,
  result: {
    analysis: EasyReadAnalysis;
    modelName: string;
    promptVersion: string;
    confidenceLabel?: string;
  },
  options: { review?: boolean } = {},
) {
  const job = db
    .prepare<[string], { id: string; judgment_id: string }>(
      "SELECT id, judgment_id FROM judgment_generation_jobs WHERE id = ?",
    )
    .get(jobId);

  if (!job) {
    throw new Error("Generation job not found");
  }

  const status = options.review ? "needs_review" : "ready";
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO analysis_results
        (id, judgment_id, job_id, mode, content_json, confidence_label,
          prompt_version, model_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId("analysis"),
      job.judgment_id,
      job.id,
      "easy_read",
      JSON.stringify(result.analysis),
      result.confidenceLabel ?? "ai_generated",
      result.promptVersion,
      result.modelName,
      now,
    );
    db.prepare(
      `UPDATE judgment_generation_jobs
        SET status = ?, updated_at = ?, completed_at = ?
        WHERE id = ?`,
    ).run(status, now, now, job.id);
    db.prepare(
      `UPDATE judgments
        SET status = ?, updated_at = ?
        WHERE id = ?`,
    ).run(status, now, job.judgment_id);
  });
  tx();

  auditLog(db, {
    action: options.review ? "job.needs_review" : "job.completed",
    targetType: "generation_job",
    targetId: job.id,
    metadata: { judgmentId: job.judgment_id },
  });

  if (!options.review) {
    await sendReadyNotifications(db, job.id);
  }
}

/** 검토 대기(needs_review) 결과를 승인해 공개하고 알림을 발송한다. */
export async function approveGenerationJob(db: SqliteDatabase, jobId: string) {
  const job = db
    .prepare<[string], { id: string; judgment_id: string; status: string }>(
      "SELECT id, judgment_id, status FROM judgment_generation_jobs WHERE id = ?",
    )
    .get(jobId);
  if (!job || job.status !== "needs_review") {
    return false;
  }

  const now = nowIso();
  db.prepare(
    `UPDATE judgment_generation_jobs
      SET status = 'ready', updated_at = ?
      WHERE id = ?`,
  ).run(now, job.id);
  db.prepare(
    `UPDATE judgments SET status = 'ready', updated_at = ? WHERE id = ?`,
  ).run(now, job.judgment_id);
  auditLog(db, {
    action: "job.review_approved",
    targetType: "generation_job",
    targetId: job.id,
    metadata: { judgmentId: job.judgment_id },
  });
  await sendReadyNotifications(db, job.id);
  return true;
}

/** 검토 대기 결과를 반려한다. 문서는 재생성 대기 상태로 돌아간다. */
export function rejectGenerationJob(
  db: SqliteDatabase,
  jobId: string,
  reason: string,
) {
  const job = db
    .prepare<[string], { id: string; judgment_id: string; status: string }>(
      "SELECT id, judgment_id, status FROM judgment_generation_jobs WHERE id = ?",
    )
    .get(jobId);
  if (!job || job.status !== "needs_review") {
    return false;
  }

  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE judgment_generation_jobs
        SET status = 'failed', failure_reason = ?, updated_at = ?
        WHERE id = ?`,
    ).run(reason, now, job.id);
    db.prepare(
      `UPDATE judgments SET status = 'pending', updated_at = ? WHERE id = ?`,
    ).run(now, job.judgment_id);
    db.prepare(`DELETE FROM analysis_results WHERE job_id = ?`).run(job.id);
  });
  tx();
  auditLog(db, {
    action: "job.review_rejected",
    targetType: "generation_job",
    targetId: job.id,
    metadata: { judgmentId: job.judgment_id, reason },
  });
  return true;
}

/** 실패했거나 반려된 작업을 다시 생성 큐에 넣는다. */
export function requeueGenerationJob(db: SqliteDatabase, jobId: string) {
  const now = nowIso();
  const updated = db
    .prepare(
      `UPDATE judgment_generation_jobs
        SET status = 'queued', attempts = 0, failure_reason = NULL,
          locked_at = NULL, completed_at = NULL, updated_at = ?
        WHERE id = ? AND status IN ('failed', 'needs_review')`,
    )
    .run(now, jobId);
  if (updated.changes === 0) {
    return false;
  }
  auditLog(db, {
    action: "job.requeued",
    targetType: "generation_job",
    targetId: jobId,
    metadata: {},
  });
  return true;
}

export function failGenerationJob(
  db: SqliteDatabase,
  jobId: string,
  reason: string,
) {
  db.prepare(
    `UPDATE judgment_generation_jobs
      SET status = 'failed', failure_reason = ?, updated_at = ?
      WHERE id = ?`,
  ).run(reason, nowIso(), jobId);
  auditLog(db, {
    action: "job.failed",
    targetType: "generation_job",
    targetId: jobId,
    metadata: { reason },
  });
}
