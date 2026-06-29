import { auditLog } from "./audit";
import type { SqliteDatabase } from "./db";
import { sampleAnalysis } from "./easyread";
import { sendReadyNotifications } from "./notifications";
import { newId } from "./security/crypto";
import { nowIso } from "./time";

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

export function lockNextGenerationJob(db: SqliteDatabase) {
  const job = db
    .prepare<[], { id: string; judgment_id: string; attempts: number }>(
      `SELECT id, judgment_id, attempts
        FROM judgment_generation_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1`,
    )
    .get();

  if (!job) {
    return null;
  }

  const now = nowIso();
  db.prepare(
    `UPDATE judgment_generation_jobs
      SET status = 'generating',
        locked_at = ?,
        attempts = attempts + 1,
        updated_at = ?
      WHERE id = ? AND status = 'queued'`,
  ).run(now, now, job.id);

  return job;
}

export async function completeGenerationJob(db: SqliteDatabase, jobId: string) {
  const job = db
    .prepare<[string], { id: string; judgment_id: string }>(
      "SELECT id, judgment_id FROM judgment_generation_jobs WHERE id = ?",
    )
    .get(jobId);

  if (!job) {
    throw new Error("Generation job not found");
  }

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
      JSON.stringify(sampleAnalysis),
      "external_grounded_mock",
      "easyread-beta-001",
      "mock-generator",
      now,
    );
    db.prepare(
      `UPDATE judgment_generation_jobs
        SET status = 'ready', updated_at = ?, completed_at = ?
        WHERE id = ?`,
    ).run(now, now, job.id);
    db.prepare(
      `UPDATE judgments
        SET status = 'ready', updated_at = ?
        WHERE id = ?`,
    ).run(now, job.judgment_id);
  });
  tx();

  auditLog(db, {
    action: "job.completed",
    targetType: "generation_job",
    targetId: job.id,
    metadata: { judgmentId: job.judgment_id },
  });

  await sendReadyNotifications(db, job.id);
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
