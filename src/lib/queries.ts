import type { SqliteDatabase } from "./db";
import type {
  DashboardSnapshot,
  EasyReadAnalysis,
  JudgmentDetail,
  JudgmentListItem,
} from "./types";

export function getPublicJudgments(
  db: SqliteDatabase,
  options: { limit?: number } = {},
): JudgmentListItem[] {
  const limitClause =
    typeof options.limit === "number" && options.limit > 0 ? "LIMIT ?" : "";
  const parameters = limitClause ? [Math.floor(options.limit ?? 0)] : [];

  return db
    .prepare<
      number[],
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
        source_external_id: string;
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
        judgments.source_external_id,
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
      ORDER BY decided_on DESC
      ${limitClause}`,
    )
    .all(...parameters)
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
      sourceExternalId: row.source_external_id,
      latestJobStatus:
        row.latest_job_status as JudgmentListItem["latestJobStatus"],
      notificationCount: row.notification_count,
    }));
}

export function getLatestAnalysis(
  db: SqliteDatabase,
  judgmentId: string,
): EasyReadAnalysis | null {
  // 검토 대기(needs_review) 중인 결과는 승인 전까지 노출하지 않는다.
  const row = db
    .prepare<[string], { content_json: string }>(
      `SELECT analysis_results.content_json
        FROM analysis_results
        JOIN judgment_generation_jobs
          ON judgment_generation_jobs.id = analysis_results.job_id
        WHERE analysis_results.judgment_id = ?
          AND judgment_generation_jobs.status = 'ready'
        ORDER BY analysis_results.created_at DESC
        LIMIT 1`,
    )
    .get(judgmentId);

  if (!row) {
    return null;
  }

  return JSON.parse(row.content_json) as EasyReadAnalysis;
}

const judgmentDetailSql = `SELECT judgments.id,
  judgments.case_number,
  judgments.court_name,
  judgments.decided_on,
  judgments.title,
  judgments.case_type,
  judgments.status,
  judgments.visibility,
  judgments.source_provider,
  judgments.source_external_id,
  judgments.source_url,
  judgments.source_trust,
  judgments.source_summary,
  judgment_texts.original_text,
  judgments.created_by_user_id,
  judgments.organization_id,
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
LEFT JOIN judgment_texts ON judgment_texts.judgment_id = judgments.id`;

type JudgmentDetailRow = {
  id: string;
  case_number: string;
  court_name: string;
  decided_on: string;
  title: string;
  case_type: string;
  status: JudgmentDetail["status"];
  visibility: JudgmentDetail["visibility"];
  source_provider: string;
  source_external_id: string;
  source_url: string | null;
  source_trust: JudgmentDetail["sourceTrust"];
  source_summary: string | null;
  original_text: string | null;
  created_by_user_id: string | null;
  organization_id: string | null;
  latest_job_status: string | null;
  notification_count: number;
};

function mapJudgmentDetail(row: JudgmentDetailRow): JudgmentDetail {
  return {
    id: row.id,
    caseNumber: row.case_number,
    courtName: row.court_name,
    decidedOn: row.decided_on,
    title: row.title,
    caseType: row.case_type,
    status: row.status,
    visibility: row.visibility,
    sourceProvider: row.source_provider,
    sourceExternalId: row.source_external_id,
    sourceUrl: row.source_url,
    sourceTrust: row.source_trust,
    sourceSummary: row.source_summary,
    originalText: row.original_text,
    createdByUserId: row.created_by_user_id,
    organizationId: row.organization_id,
    latestJobStatus: row.latest_job_status as JudgmentDetail["latestJobStatus"],
    notificationCount: row.notification_count,
  };
}

export function getPublicJudgmentByCaseNumber(
  db: SqliteDatabase,
  caseNumber: string,
) {
  const row = db
    .prepare<[string], JudgmentDetailRow>(
      `${judgmentDetailSql}
       WHERE judgments.visibility = 'public'
         AND judgments.case_number = ?
       LIMIT 1`,
    )
    .get(caseNumber);
  return row ? mapJudgmentDetail(row) : null;
}

export function getPublicJudgmentByIdentifier(
  db: SqliteDatabase,
  identifier: string,
) {
  const row = db
    .prepare<[string, string], JudgmentDetailRow>(
      `${judgmentDetailSql}
       WHERE judgments.visibility = 'public'
         AND (judgments.id = ? OR judgments.case_number = ?)
       LIMIT 1`,
    )
    .get(identifier, identifier);
  return row ? mapJudgmentDetail(row) : null;
}

export function getPublicJudgmentsByCaseNumbers(
  db: SqliteDatabase,
  caseNumbers: string[],
) {
  const uniqueCaseNumbers = [...new Set(caseNumbers)].filter(Boolean);
  if (uniqueCaseNumbers.length === 0) {
    return [];
  }

  return db
    .prepare<unknown[], JudgmentDetailRow>(
      `${judgmentDetailSql}
       WHERE judgments.visibility = 'public'
         AND judgments.case_number IN (${uniqueCaseNumbers.map(() => "?").join(", ")})`,
    )
    .all(...uniqueCaseNumbers)
    .map(mapJudgmentDetail);
}

export function getCustomJudgmentById(
  db: SqliteDatabase,
  id: string,
  userId: string,
) {
  const row = db
    .prepare<[string, string], JudgmentDetailRow>(
      `${judgmentDetailSql}
       WHERE judgments.visibility = 'private'
         AND judgments.id = ?
         AND judgments.created_by_user_id = ?
       LIMIT 1`,
    )
    .get(id, userId);
  return row ? mapJudgmentDetail(row) : null;
}

/** 본인 소유이거나 소속 조직에 공유된 사용자 문서를 반환한다. */
export function getAccessibleUserJudgmentById(
  db: SqliteDatabase,
  id: string,
  userId: string,
) {
  const row = db
    .prepare<[string, string, string, string], JudgmentDetailRow>(
      `${judgmentDetailSql}
       WHERE judgments.id = ?
         AND (
           (judgments.visibility IN ('private', 'organization')
             AND judgments.created_by_user_id = ?)
           OR (judgments.visibility = 'organization'
             AND judgments.organization_id IN (
               SELECT organizations.id
               FROM organizations
               LEFT JOIN organization_members
                 ON organization_members.organization_id = organizations.id
               WHERE organizations.owner_user_id = ?
                 OR organization_members.user_id = ?
             ))
         )
       LIMIT 1`,
    )
    .get(id, userId, userId, userId);
  return row ? mapJudgmentDetail(row) : null;
}

export type OrganizationSharedJudgment = {
  id: string;
  title: string;
  caseNumber: string;
  status: JudgmentDetail["status"];
  organizationId: string;
  organizationName: string;
  sharedByEmail: string | null;
  updatedAt: string;
};

/** 사용자가 속한 조직들에 공유된 문서 목록. */
export function getOrganizationSharedJudgments(
  db: SqliteDatabase,
  userId: string,
): OrganizationSharedJudgment[] {
  return db
    .prepare<
      [string, string],
      {
        id: string;
        title: string;
        case_number: string;
        status: JudgmentDetail["status"];
        organization_id: string;
        organization_name: string;
        shared_by_email: string | null;
        updated_at: string;
      }
    >(
      `SELECT judgments.id,
        judgments.title,
        judgments.case_number,
        judgments.status,
        organizations.id AS organization_id,
        organizations.name AS organization_name,
        users.email AS shared_by_email,
        judgments.updated_at
      FROM judgments
      JOIN organizations ON organizations.id = judgments.organization_id
      LEFT JOIN users ON users.id = judgments.created_by_user_id
      WHERE judgments.visibility = 'organization'
        AND judgments.organization_id IN (
          SELECT organizations.id
          FROM organizations
          LEFT JOIN organization_members
            ON organization_members.organization_id = organizations.id
          WHERE organizations.owner_user_id = ?
            OR organization_members.user_id = ?
        )
      ORDER BY judgments.updated_at DESC`,
    )
    .all(userId, userId)
    .map((row) => ({
      caseNumber: row.case_number,
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      sharedByEmail: row.shared_by_email,
      status: row.status,
      title: row.title,
      updatedAt: row.updated_at,
    }));
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
