import { auditLog } from "./audit";
import type { SqliteDatabase } from "./db";
import {
  fetchOpenLawJudgments,
  upsertJudgmentFromExternal,
} from "./external-law";
import { logIntegrationEvent } from "./integration-events";
import { newId } from "./security/crypto";
import { deleteSetting, getSetting, setSetting } from "./settings";
import { addMinutesIso, nowIso } from "./time";
import type { ExternalJudgmentRecord } from "./types";

const SERVICE = "judgment-collection";
const DEFAULT_QUERY = "손해배상";
const COLLECTION_PAGE_SIZE = 100;
const DEFAULT_INTERVAL_MINUTES = 360;
const MIN_INTERVAL_MINUTES = 10;
const MAX_INTERVAL_MINUTES = 10_080;
const STALE_RUNNING_RUN_MS = 30 * 60_000;

const settingKeys = {
  enabled: "judgment_collection_enabled",
  intervalMinutes: "judgment_collection_interval_minutes",
  lastCompletedAt: "judgment_collection_last_completed_at",
  lastFailureReason: "judgment_collection_last_failure_reason",
  lastImportedCount: "judgment_collection_last_imported_count",
  lastRunAt: "judgment_collection_last_run_at",
  nextRunAt: "judgment_collection_next_run_at",
  query: "judgment_collection_query",
  status: "judgment_collection_status",
} as const;

export type JudgmentCollectionSettings = {
  enabled: boolean;
  intervalMinutes: number;
  query: string;
};

export type JudgmentCollectionStatus = JudgmentCollectionSettings & {
  lastCompletedAt: string | null;
  lastFailureReason: string | null;
  lastImportedCount: number;
  lastRunAt: string | null;
  nextRunAt: string;
  status: string;
};

export type JudgmentCollectionRun = {
  actorUserId: string | null;
  completedAt: string | null;
  createdCount: number;
  display: number;
  failureReason: string | null;
  id: string;
  importedCount: number;
  query: string;
  startedAt: string;
  status: string;
  trigger: string;
  updatedCount: number;
};

type RunInput = {
  actorUserId?: string;
  forceRefresh?: boolean;
  trigger: "manual" | "schedule";
};

let activeRun: Promise<JudgmentCollectionRunResult> | null = null;

export type JudgmentCollectionRunResult =
  | {
      ok: true;
      createdCount: number;
      importedCount: number;
      runId: string;
      updatedCount: number;
    }
  | {
      ok: false;
      reason: "disabled" | "not_due" | "already_running" | "failed";
    };

export function getJudgmentCollectionStatus(
  db: SqliteDatabase,
): JudgmentCollectionStatus {
  const settings = getJudgmentCollectionSettings(db);
  const lastRunAt = getSetting(db, settingKeys.lastRunAt);
  const lastCompletedAt = getSetting(db, settingKeys.lastCompletedAt);
  return {
    ...settings,
    lastCompletedAt,
    lastFailureReason: getSetting(db, settingKeys.lastFailureReason),
    lastImportedCount: parseIntegerSetting(
      getSetting(db, settingKeys.lastImportedCount),
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    lastRunAt,
    nextRunAt:
      getSetting(db, settingKeys.nextRunAt) ??
      addMinutesFromIso(lastRunAt ?? nowIso(), settings.intervalMinutes),
    status: getSetting(db, settingKeys.status) ?? "idle",
  };
}

export function updateJudgmentCollectionSettings(
  db: SqliteDatabase,
  input: Partial<JudgmentCollectionSettings>,
) {
  const current = getJudgmentCollectionSettings(db);
  const settings = {
    enabled: input.enabled ?? current.enabled,
    intervalMinutes: clampInteger(
      input.intervalMinutes ?? current.intervalMinutes,
      MIN_INTERVAL_MINUTES,
      MAX_INTERVAL_MINUTES,
    ),
    query: normalizeQuery(input.query ?? current.query),
  };

  setSetting(db, settingKeys.enabled, settings.enabled ? "true" : "false");
  setSetting(db, settingKeys.intervalMinutes, String(settings.intervalMinutes));
  setSetting(db, settingKeys.query, settings.query);
  setSetting(db, settingKeys.nextRunAt, nextRunAtFromSettings(settings));

  logIntegrationEvent(db, {
    action: "settings.update",
    message: "Judgment collection settings were updated.",
    metadata: settings,
    service: SERVICE,
    status: "success",
  });

  return settings;
}

export async function runDueJudgmentCollection(
  db: SqliteDatabase,
): Promise<JudgmentCollectionRunResult> {
  const status = getJudgmentCollectionStatus(db);
  if (!status.enabled) {
    return { ok: false, reason: "disabled" };
  }
  if (new Date(status.nextRunAt) > new Date()) {
    return { ok: false, reason: "not_due" };
  }
  return runJudgmentCollection(db, { trigger: "schedule" });
}

export async function runJudgmentCollection(
  db: SqliteDatabase,
  input: RunInput,
): Promise<JudgmentCollectionRunResult> {
  if (activeRun) {
    return { ok: false, reason: "already_running" };
  }

  activeRun = runJudgmentCollectionInternal(db, input);
  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
}

export function listJudgmentCollectionRuns(
  db: SqliteDatabase,
  limit = 10,
): JudgmentCollectionRun[] {
  return db
    .prepare<
      [number],
      {
        actor_user_id: string | null;
        completed_at: string | null;
        created_count: number;
        display: number;
        failure_reason: string | null;
        id: string;
        imported_count: number;
        query: string;
        started_at: string;
        status: string;
        trigger: string;
        updated_count: number;
      }
    >(
      `SELECT id, trigger, status, query, display, imported_count,
        created_count, updated_count, failure_reason, actor_user_id,
        started_at, completed_at
       FROM judgment_collection_runs
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(limit)
    .map((row) => ({
      actorUserId: row.actor_user_id,
      completedAt: row.completed_at,
      createdCount: row.created_count,
      display: row.display,
      failureReason: row.failure_reason,
      id: row.id,
      importedCount: row.imported_count,
      query: row.query,
      startedAt: row.started_at,
      status: row.status,
      trigger: row.trigger,
      updatedCount: row.updated_count,
    }));
}

async function runJudgmentCollectionInternal(
  db: SqliteDatabase,
  input: RunInput,
): Promise<JudgmentCollectionRunResult> {
  const running = db
    .prepare<[], { id: string; started_at: string }>(
      `SELECT id
         , started_at
       FROM judgment_collection_runs
       WHERE status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .get();
  if (running) {
    if (
      Date.now() - new Date(running.started_at).getTime() <
      STALE_RUNNING_RUN_MS
    ) {
      return { ok: false, reason: "already_running" };
    }
    db.prepare(
      `UPDATE judgment_collection_runs
       SET status = 'failed',
         failure_reason = ?,
         completed_at = ?
       WHERE id = ?`,
    ).run(
      "Previous collection run expired before completion.",
      nowIso(),
      running.id,
    );
  }

  const settings = getJudgmentCollectionSettings(db);
  const startedAt = nowIso();
  const runId = newId("collect");
  db.prepare(
    `INSERT INTO judgment_collection_runs
      (id, trigger, status, query, display, actor_user_id, started_at)
     VALUES (?, ?, 'running', ?, ?, ?, ?)`,
  ).run(
    runId,
    input.trigger,
    settings.query,
    COLLECTION_PAGE_SIZE,
    input.actorUserId ?? null,
    startedAt,
  );
  setSetting(db, settingKeys.status, "running");
  setSetting(db, settingKeys.lastRunAt, startedAt);

  try {
    const records = await fetchAllOpenLawJudgments(db, settings.query, {
      forceRefresh: input.forceRefresh,
    });
    let createdCount = 0;
    let updatedCount = 0;
    for (const record of records) {
      const existed = hasJudgmentSource(
        db,
        record.sourceProvider,
        record.externalId,
      );
      upsertJudgmentFromExternal(db, record);
      if (existed) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    }

    const completedAt = nowIso();
    db.prepare(
      `UPDATE judgment_collection_runs
       SET status = 'success',
         imported_count = ?,
         created_count = ?,
         updated_count = ?,
         completed_at = ?
       WHERE id = ?`,
    ).run(records.length, createdCount, updatedCount, completedAt, runId);

    setSetting(db, settingKeys.status, "success");
    setSetting(db, settingKeys.lastCompletedAt, completedAt);
    deleteSetting(db, settingKeys.lastFailureReason);
    setSetting(db, settingKeys.lastImportedCount, String(records.length));
    setSetting(db, settingKeys.nextRunAt, nextRunAtFromSettings(settings));

    logIntegrationEvent(db, {
      action: "collection.run",
      message: `${records.length} judgment records were collected.`,
      metadata: {
        createdCount,
        pageSize: COLLECTION_PAGE_SIZE,
        query: settings.query,
        trigger: input.trigger,
        updatedCount,
      },
      service: SERVICE,
      status: "success",
    });
    auditLog(db, {
      actorUserId: input.actorUserId,
      action: "judgment_collection.run",
      targetType: "judgment_collection_run",
      targetId: runId,
      metadata: { createdCount, importedCount: records.length, updatedCount },
    });

    return {
      ok: true,
      createdCount,
      importedCount: records.length,
      runId,
      updatedCount,
    };
  } catch (error) {
    const failureReason =
      error instanceof Error ? error.message : "Judgment collection failed.";
    const completedAt = nowIso();
    db.prepare(
      `UPDATE judgment_collection_runs
       SET status = 'failed',
         failure_reason = ?,
         completed_at = ?
       WHERE id = ?`,
    ).run(failureReason, completedAt, runId);

    setSetting(db, settingKeys.status, "failed");
    setSetting(db, settingKeys.lastFailureReason, failureReason);
    setSetting(db, settingKeys.nextRunAt, nextRunAtFromSettings(settings));
    logIntegrationEvent(db, {
      action: "collection.run",
      message: failureReason,
      metadata: { query: settings.query, trigger: input.trigger },
      service: SERVICE,
      status: "failed",
    });
    auditLog(db, {
      actorUserId: input.actorUserId,
      action: "judgment_collection.failed",
      targetType: "judgment_collection_run",
      targetId: runId,
      metadata: { failureReason },
    });
    return { ok: false, reason: "failed" };
  }
}

function getJudgmentCollectionSettings(
  db: SqliteDatabase,
): JudgmentCollectionSettings {
  return {
    enabled: getSetting(db, settingKeys.enabled) === "true",
    intervalMinutes: parseIntegerSetting(
      getSetting(db, settingKeys.intervalMinutes),
      DEFAULT_INTERVAL_MINUTES,
      MIN_INTERVAL_MINUTES,
      MAX_INTERVAL_MINUTES,
    ),
    query: normalizeQuery(getSetting(db, settingKeys.query) ?? DEFAULT_QUERY),
  };
}

async function fetchAllOpenLawJudgments(
  db: SqliteDatabase,
  query: string,
  options: { forceRefresh?: boolean },
) {
  const records: ExternalJudgmentRecord[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (true) {
    const pageRecords = await fetchOpenLawJudgments(db, query, {
      display: COLLECTION_PAGE_SIZE,
      forceRefresh: options.forceRefresh,
      page,
    });
    if (pageRecords.length === 0) {
      break;
    }

    let addedCount = 0;
    for (const record of pageRecords) {
      const key = `${record.sourceProvider}:${record.externalId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      records.push(record);
      addedCount += 1;
    }

    if (addedCount === 0) {
      break;
    }
    page += 1;
  }

  return records;
}

function hasJudgmentSource(
  db: SqliteDatabase,
  sourceProvider: string,
  externalId: string,
) {
  return Boolean(
    db
      .prepare<[string, string], { id: string }>(
        `SELECT id
         FROM judgments
         WHERE source_provider = ? AND source_external_id = ?
         LIMIT 1`,
      )
      .get(sourceProvider, externalId),
  );
}

function nextRunAtFromSettings(settings: JudgmentCollectionSettings) {
  return addMinutesIso(settings.intervalMinutes);
}

function addMinutesFromIso(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function normalizeQuery(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 100) : DEFAULT_QUERY;
}

function parseIntegerSetting(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value) {
    return fallback;
  }
  return clampInteger(Number.parseInt(value, 10), min, max);
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isInteger(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
