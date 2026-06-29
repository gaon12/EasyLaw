import type { SqliteDatabase } from "./db";
import type {
  DashboardSnapshot,
  EasyReadAnalysis,
  JudgmentListItem,
} from "./types";

export function getPublicJudgments(db: SqliteDatabase): JudgmentListItem[] {
  return db
    .prepare<
      [],
      {
        id: string;
        case_number: string;
        court_name: string;
        decided_on: string;
        title: string;
        case_type: string;
        status: "pending" | "ready" | "needs_review";
        visibility: "public" | "private" | "organization";
        source_provider: string;
        latest_job_status: string | null;
        notification_count: number;
      }
    >(
      `SELECT judgments.id,
        judgments.case_number,
        judgments.court_name,
        judgments.decided_on,
        judgments.title,
        judgments.case_type,
        judgments.status,
        judgments.visibility,
        judgments.source_provider,
        (
          SELECT status FROM judgment_generation_jobs
          WHERE judgment_generation_jobs.judgment_id = judgments.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS latest_job_status,
        (
          SELECT COUNT(*) FROM notifications
          WHERE notifications.judgment_id = judgments.id
        ) AS notification_count
      FROM judgments
      WHERE visibility = 'public'
      ORDER BY decided_on DESC`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      caseNumber: row.case_number,
      courtName: row.court_name,
      decidedOn: row.decided_on,
      title: row.title,
      caseType: row.case_type,
      status: row.status,
      visibility: row.visibility,
      sourceProvider: row.source_provider,
      latestJobStatus:
        row.latest_job_status as JudgmentListItem["latestJobStatus"],
      notificationCount: row.notification_count,
    }));
}

export function getLatestAnalysis(
  db: SqliteDatabase,
  judgmentId: string,
): EasyReadAnalysis | null {
  const row = db
    .prepare<[string], { content_json: string }>(
      `SELECT content_json
        FROM analysis_results
        WHERE judgment_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get(judgmentId);

  if (!row) {
    return null;
  }

  return JSON.parse(row.content_json) as EasyReadAnalysis;
}

export function getDashboardSnapshot(db: SqliteDatabase): DashboardSnapshot {
  const scalar = (sql: string) =>
    db.prepare<[], { value: number }>(sql).get()?.value ?? 0;

  return {
    userCount: scalar("SELECT COUNT(*) as value FROM users"),
    organizationCount: scalar("SELECT COUNT(*) as value FROM organizations"),
    publicJudgmentCount: scalar(
      "SELECT COUNT(*) as value FROM judgments WHERE visibility = 'public'",
    ),
    queuedJobCount: scalar(
      "SELECT COUNT(*) as value FROM judgment_generation_jobs WHERE status = 'queued'",
    ),
    failedJobCount: scalar(
      "SELECT COUNT(*) as value FROM judgment_generation_jobs WHERE status = 'failed'",
    ),
    pendingNotificationCount: scalar(
      "SELECT COUNT(*) as value FROM notifications WHERE status = 'pending'",
    ),
  };
}

export function getManagementRows(db: SqliteDatabase) {
  return {
    users: db
      .prepare<
        [],
        {
          id: string;
          email: string;
          display_name: string;
          role: string;
          totp_enabled: number;
          totp_required: number;
        }
      >(
        `SELECT id, email, display_name, role, totp_enabled, totp_required
          FROM users
          ORDER BY created_at DESC`,
      )
      .all(),
    jobs: db
      .prepare<
        [],
        {
          id: string;
          status: string;
          attempts: number;
          failure_reason: string | null;
          title: string;
          case_number: string;
        }
      >(
        `SELECT judgment_generation_jobs.id,
          judgment_generation_jobs.status,
          judgment_generation_jobs.attempts,
          judgment_generation_jobs.failure_reason,
          judgments.title,
          judgments.case_number
        FROM judgment_generation_jobs
        JOIN judgments ON judgments.id = judgment_generation_jobs.judgment_id
        ORDER BY judgment_generation_jobs.created_at DESC`,
      )
      .all(),
    auditLogs: db
      .prepare<
        [],
        {
          action: string;
          target_type: string;
          target_id: string | null;
          created_at: string;
        }
      >(
        `SELECT action, target_type, target_id, created_at
          FROM audit_logs
          ORDER BY created_at DESC
          LIMIT 20`,
      )
      .all(),
  };
}
