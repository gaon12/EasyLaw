import { auditLog } from "./audit";
import type { SqliteDatabase } from "./db";
import {
  fetchOpenLawRecordPage,
  hydrateOpenLawRecordOriginalText,
  openLawCollectionTargets,
  upsertJudgmentsFromExternal,
} from "./external-law";
import { logIntegrationEvent } from "./integration-events";
import { newId } from "./security/crypto";
import { deleteSetting, getSetting, setSetting } from "./settings";
import { addMinutesIso, nowIso } from "./time";
import type { ExternalJudgmentRecord } from "./types";

const SERVICE = "judgment-collection";
const COLLECTION_SCOPE_LABEL = "전체 판례·헌재·법령·행정규칙·자치법규";
const COLLECTION_PAGE_SIZE = 100;
const COLLECTION_HYDRATE_CONCURRENCY = 100;
const COLLECTION_PROGRESS_BATCH_SIZE = 25;
const DEFAULT_INTERVAL_MINUTES = 360;
const MIN_INTERVAL_MINUTES = 10;
const MAX_INTERVAL_MINUTES = 10_080;
// 진행 기록이 이 시간 넘게 멈춘 running 상태 run은 죽은 프로세스가 남긴
// 것으로 보고 저장된 커서부터 이어서 실행한다.
const RESUME_STALL_MS = 2 * 60_000;
const progressStagePercent = {
  done: 100,
  finalizing: 96,
  listing: 8,
  preparing: 2,
  saving: 30,
} as const;
const savingProgressWeight = 65;
const listingProgressWeight = 22;

const settingKeys = {
  enabled: "judgment_collection_enabled",
  intervalMinutes: "judgment_collection_interval_minutes",
  lastCompletedAt: "judgment_collection_last_completed_at",
  lastFailureReason: "judgment_collection_last_failure_reason",
  lastImportedCount: "judgment_collection_last_imported_count",
  lastRunAt: "judgment_collection_last_run_at",
  nextRunAt: "judgment_collection_next_run_at",
  status: "judgment_collection_status",
} as const;

export type JudgmentCollectionSettings = {
  enabled: boolean;
  intervalMinutes: number;
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

export type JudgmentCollectionProgressStage =
  | "preparing"
  | "listing"
  | "saving"
  | "finalizing"
  | "done";

export type JudgmentCollectionProgress = {
  createdCount: number;
  current: number;
  failureReason: string | null;
  importedCount: number;
  message: string;
  percent: number;
  runId: string;
  stage: JudgmentCollectionProgressStage;
  status: string;
  total: number;
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

export type JudgmentCollectionStartResult =
  | { ok: true; runId: string; resumed: boolean }
  | { ok: false; reason: "already_running" };

type ResumeState = {
  counts: { createdCount: number; importedCount: number; updatedCount: number };
  cursorPage: number;
  cursorTarget: string | null;
};

type CollectionCandidate = {
  record: ExternalJudgmentRecord;
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
  };

  setSetting(db, settingKeys.enabled, settings.enabled ? "true" : "false");
  setSetting(db, settingKeys.intervalMinutes, String(settings.intervalMinutes));
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

/**
 * 수집을 백그라운드로 시작하고 즉시 runId를 반환한다. 최초 전체 수집처럼
 * 오래 걸리는 작업이 HTTP 요청 타임아웃에 묶이지 않도록 하며, 진행 상황은
 * getJudgmentCollectionProgress 폴링으로 확인한다. 죽은 프로세스가 남긴
 * running 상태 run이 있으면 저장된 커서부터 이어서 실행한다.
 */
export function startJudgmentCollection(
  db: SqliteDatabase,
  input: RunInput,
): JudgmentCollectionStartResult {
  if (activeRun) {
    return { ok: false, reason: "already_running" };
  }

  const running = findRunningRun(db);
  if (running) {
    const lastProgressAt = running.last_progress_at ?? running.started_at;
    if (Date.now() - new Date(lastProgressAt).getTime() < RESUME_STALL_MS) {
      return { ok: false, reason: "already_running" };
    }
    const resume: ResumeState = {
      counts: {
        createdCount: running.created_count,
        importedCount: running.imported_count,
        updatedCount: running.updated_count,
      },
      cursorPage: Math.max(1, running.cursor_page),
      cursorTarget: running.cursor_target,
    };
    activeRun = executeRun(db, running.id, input, resume).finally(() => {
      activeRun = null;
    });
    return { ok: true, resumed: true, runId: running.id };
  }

  const runId = createRunRow(db, input);
  activeRun = executeRun(db, runId, input, null).finally(() => {
    activeRun = null;
  });
  return { ok: true, resumed: false, runId };
}

export async function runJudgmentCollection(
  db: SqliteDatabase,
  input: RunInput,
): Promise<JudgmentCollectionRunResult> {
  const started = startJudgmentCollection(db, input);
  if (!started.ok) {
    return started;
  }
  return (
    (await activeRun) ?? {
      ok: false,
      reason: "failed",
    }
  );
}

/** 서버 재시작 등으로 중단된 running 상태 run이 있으면 이어서 실행한다. */
export async function resumeInterruptedJudgmentCollection(
  db: SqliteDatabase,
): Promise<JudgmentCollectionRunResult | null> {
  if (activeRun) {
    return null;
  }
  const running = findRunningRun(db);
  if (!running) {
    return null;
  }
  const lastProgressAt = running.last_progress_at ?? running.started_at;
  if (Date.now() - new Date(lastProgressAt).getTime() < RESUME_STALL_MS) {
    return null;
  }
  return runJudgmentCollection(db, { trigger: "schedule" });
}

function findRunningRun(db: SqliteDatabase) {
  return db
    .prepare<
      [],
      {
        created_count: number;
        cursor_page: number;
        cursor_target: string | null;
        id: string;
        imported_count: number;
        last_progress_at: string | null;
        started_at: string;
        updated_count: number;
      }
    >(
      `SELECT id, started_at, last_progress_at, cursor_target, cursor_page,
        imported_count, created_count, updated_count
       FROM judgment_collection_runs
       WHERE status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .get();
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

export function getJudgmentCollectionProgress(
  db: SqliteDatabase,
): JudgmentCollectionProgress | null {
  const row = db
    .prepare<
      [],
      {
        created_count: number;
        failure_reason: string | null;
        id: string;
        imported_count: number;
        progress_current: number;
        progress_message: string;
        progress_stage: string;
        progress_total: number;
        status: string;
        updated_count: number;
      }
    >(
      `SELECT id, status, imported_count, created_count, updated_count,
        failure_reason, progress_stage, progress_current, progress_total,
        progress_message
       FROM judgment_collection_runs
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .get();
  if (!row) {
    return null;
  }

  const stage = parseProgressStage(row.progress_stage);
  return {
    createdCount: row.created_count,
    current: row.progress_current,
    failureReason: row.failure_reason,
    importedCount: row.imported_count,
    message: row.progress_message,
    percent: progressPercent({
      current: row.progress_current,
      stage,
      status: row.status,
      total: row.progress_total,
    }),
    runId: row.id,
    stage,
    status: row.status,
    total: row.progress_total,
    updatedCount: row.updated_count,
  };
}

function createRunRow(db: SqliteDatabase, input: RunInput) {
  const startedAt = nowIso();
  const runId = newId("collect");
  db.prepare(
    `INSERT INTO judgment_collection_runs
      (id, trigger, status, query, display, actor_user_id, started_at,
        last_progress_at)
     VALUES (?, ?, 'running', ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    input.trigger,
    COLLECTION_SCOPE_LABEL,
    COLLECTION_PAGE_SIZE,
    input.actorUserId ?? null,
    startedAt,
    startedAt,
  );
  setSetting(db, settingKeys.status, "running");
  setSetting(db, settingKeys.lastRunAt, startedAt);
  updateRunProgress(db, runId, {
    current: 0,
    message: "수집 요청을 준비하고 있어요.",
    stage: "preparing",
    total: 1,
  });
  return runId;
}

async function executeRun(
  db: SqliteDatabase,
  runId: string,
  input: RunInput,
  resume: ResumeState | null,
): Promise<JudgmentCollectionRunResult> {
  const settings = getJudgmentCollectionSettings(db);
  if (resume) {
    setSetting(db, settingKeys.status, "running");
    updateRunProgress(db, runId, {
      current: 0,
      message: "중단된 수집을 이어서 실행하고 있어요.",
      stage: "preparing",
      total: 1,
    });
  }

  try {
    const counts = await collectAndStoreOpenLawRecords(
      db,
      runId,
      {
        forceRefresh: input.forceRefresh,
      },
      resume,
    );
    updateRunProgress(db, runId, {
      current: 1,
      message: "수집 결과를 정리하고 있어요.",
      stage: "finalizing",
      total: 1,
    });

    const completedAt = nowIso();
    db.prepare(
      `UPDATE judgment_collection_runs
       SET status = 'success',
         imported_count = ?,
         created_count = ?,
         updated_count = ?,
         completed_at = ?,
         progress_stage = 'done',
         progress_current = ?,
         progress_total = ?,
         progress_message = ?
       WHERE id = ?`,
    ).run(
      counts.importedCount,
      counts.createdCount,
      counts.updatedCount,
      completedAt,
      Math.max(1, counts.importedCount),
      Math.max(1, counts.importedCount),
      formatSavedMessage(counts.importedCount),
      runId,
    );

    setSetting(db, settingKeys.status, "success");
    setSetting(db, settingKeys.lastCompletedAt, completedAt);
    deleteSetting(db, settingKeys.lastFailureReason);
    setSetting(db, settingKeys.lastImportedCount, String(counts.importedCount));
    setSetting(db, settingKeys.nextRunAt, nextRunAtFromSettings(settings));

    logIntegrationEvent(db, {
      action: "collection.run",
      message: `${counts.importedCount} legal records were collected.`,
      metadata: {
        createdCount: counts.createdCount,
        pageSize: COLLECTION_PAGE_SIZE,
        scope: COLLECTION_SCOPE_LABEL,
        trigger: input.trigger,
        updatedCount: counts.updatedCount,
      },
      service: SERVICE,
      status: "success",
    });
    auditLog(db, {
      actorUserId: input.actorUserId,
      action: "judgment_collection.run",
      targetType: "judgment_collection_run",
      targetId: runId,
      metadata: counts,
    });

    return {
      ok: true,
      createdCount: counts.createdCount,
      importedCount: counts.importedCount,
      runId,
      updatedCount: counts.updatedCount,
    };
  } catch (error) {
    const failureReason =
      error instanceof Error ? error.message : "Judgment collection failed.";
    const completedAt = nowIso();
    db.prepare(
      `UPDATE judgment_collection_runs
       SET status = 'failed',
         failure_reason = ?,
         completed_at = ?,
         progress_stage = 'done',
         progress_current = progress_total,
         progress_message = ?
       WHERE id = ?`,
    ).run(failureReason, completedAt, failureReason, runId);

    setSetting(db, settingKeys.status, "failed");
    setSetting(db, settingKeys.lastFailureReason, failureReason);
    setSetting(db, settingKeys.nextRunAt, nextRunAtFromSettings(settings));
    logIntegrationEvent(db, {
      action: "collection.run",
      message: failureReason,
      metadata: { scope: COLLECTION_SCOPE_LABEL, trigger: input.trigger },
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
  };
}

async function collectAndStoreOpenLawRecords(
  db: SqliteDatabase,
  runId: string,
  options: { forceRefresh?: boolean },
  resume: ResumeState | null = null,
): Promise<{
  createdCount: number;
  importedCount: number;
  updatedCount: number;
}> {
  let createdCount = resume?.counts.createdCount ?? 0;
  let estimatedTotal = 1;
  let importedCount = resume?.counts.importedCount ?? 0;
  let updatedCount = resume?.counts.updatedCount ?? 0;
  const seen = new Set<string>();
  const resumeTargetIndex = resume?.cursorTarget
    ? Math.max(
        0,
        (openLawCollectionTargets as readonly string[]).indexOf(
          resume.cursorTarget,
        ),
      )
    : 0;

  for (const [targetIndex, target] of openLawCollectionTargets.entries()) {
    if (targetIndex < resumeTargetIndex) {
      continue;
    }
    let page =
      resume && targetIndex === resumeTargetIndex ? resume.cursorPage : 1;
    updateRunProgress(db, runId, {
      current: targetIndex,
      message: `공개 데이터 목록 확인 중: ${target} ${page}쪽`,
      stage: "listing",
      total: openLawCollectionTargets.length,
    });

    while (true) {
      // 서버가 재시작돼도 이 지점부터 이어서 실행할 수 있게 커서를 남긴다.
      db.prepare(
        `UPDATE judgment_collection_runs
         SET cursor_target = ?, cursor_page = ?, last_progress_at = ?
         WHERE id = ?`,
      ).run(target, page, nowIso(), runId);
      updateRunProgress(db, runId, {
        current: targetIndex,
        message: `공개 데이터 목록 확인 중: ${target} ${page}쪽`,
        stage: "listing",
        total: openLawCollectionTargets.length,
      });
      const result = await fetchOpenLawRecordPage(db, target, "", {
        display: COLLECTION_PAGE_SIZE,
        forceRefresh: options.forceRefresh,
        page,
      });
      const pageRecords = result.records;
      if (page === 1 && result.totalCount) {
        estimatedTotal += result.totalCount;
      }
      if (pageRecords.length === 0) {
        break;
      }

      let addedCount = 0;
      let existingCount = 0;
      const candidates: CollectionCandidate[] = [];
      for (const record of pageRecords) {
        const key = `${record.sourceProvider}:${record.externalId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const existing = getJudgmentSource(
          db,
          record.sourceProvider,
          record.externalId,
        );
        if (existing?.originalText && !isMutableOpenLawRecord(record)) {
          existingCount += 1;
          continue;
        }

        candidates.push({ record });
      }

      if (candidates.length > 0) {
        let completedHydrations = 0;
        const hydratedCandidates = await mapWithConcurrency(
          candidates,
          COLLECTION_HYDRATE_CONCURRENCY,
          async (candidate) => {
            const hydrated = await hydrateOpenLawRecordOriginalText(
              db,
              candidate.record,
            );
            completedHydrations += 1;
            if (
              completedHydrations === candidates.length ||
              completedHydrations % COLLECTION_PROGRESS_BATCH_SIZE === 0
            ) {
              updateRunProgress(db, runId, {
                current: importedCount + completedHydrations,
                message: `본문 병렬 확인 중 ${completedHydrations}/${candidates.length}건`,
                stage: "saving",
                total: estimatedTotal,
              });
            }
            return { ...candidate, record: hydrated };
          },
        );

        const pageCounts = saveHydratedCandidates(db, hydratedCandidates);
        importedCount += pageCounts.importedCount;
        createdCount += pageCounts.createdCount;
        updatedCount += pageCounts.updatedCount;
        addedCount += pageCounts.createdCount;
        existingCount += pageCounts.updatedCount;
        updateSavingProgress(db, runId, {
          createdCount,
          current: importedCount,
          total: estimatedTotal,
          updatedCount,
        });
      }

      if (
        !isMutableOpenLawTarget(target) &&
        (addedCount === 0 || existingCount > 0)
      ) {
        break;
      }
      if (
        result.totalCount &&
        page * COLLECTION_PAGE_SIZE >= result.totalCount
      ) {
        break;
      }
      page += 1;
    }
    updateRunProgress(db, runId, {
      current: targetIndex + 1,
      message: `공개 데이터 목록 확인 완료: ${target}`,
      stage: "listing",
      total: openLawCollectionTargets.length,
    });
  }

  return { createdCount, importedCount, updatedCount };
}

function saveHydratedCandidates(
  db: SqliteDatabase,
  candidates: CollectionCandidate[],
) {
  const saved = upsertJudgmentsFromExternal(
    db,
    candidates.map((candidate) => candidate.record),
  );
  let createdCount = 0;
  let updatedCount = 0;
  for (const result of saved) {
    if (result.created) {
      createdCount += 1;
    } else {
      updatedCount += 1;
    }
  }
  return {
    createdCount,
    importedCount: saved.length,
    updatedCount,
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index]);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function getJudgmentSource(
  db: SqliteDatabase,
  sourceProvider: string,
  externalId: string,
) {
  return db
    .prepare<[string, string], { id: string; originalText: string | null }>(
      `SELECT judgments.id,
        judgment_texts.original_text AS originalText
       FROM judgments
       LEFT JOIN judgment_texts ON judgment_texts.judgment_id = judgments.id
       WHERE source_provider = ? AND source_external_id = ?
       LIMIT 1`,
    )
    .get(sourceProvider, externalId);
}

function isMutableOpenLawRecord(record: ExternalJudgmentRecord) {
  return (
    record.sourceProvider === "open-law-law" ||
    record.sourceProvider === "open-law-administrative-rule" ||
    record.sourceProvider === "open-law-ordinance"
  );
}

function isMutableOpenLawTarget(target: string) {
  return target === "law" || target === "admrul" || target === "ordin";
}

function updateRunProgress(
  db: SqliteDatabase,
  runId: string,
  input: {
    current: number;
    message: string;
    stage: JudgmentCollectionProgressStage;
    total: number;
  },
) {
  db.prepare(
    `UPDATE judgment_collection_runs
     SET progress_stage = ?,
       progress_current = ?,
       progress_total = ?,
       progress_message = ?,
       last_progress_at = ?
     WHERE id = ?`,
  ).run(
    input.stage,
    input.current,
    Math.max(1, input.total),
    input.message,
    nowIso(),
    runId,
  );
}

function updateSavingProgress(
  db: SqliteDatabase,
  runId: string,
  input: {
    createdCount: number;
    current: number;
    total: number;
    updatedCount: number;
  },
) {
  db.prepare(
    `UPDATE judgment_collection_runs
     SET progress_stage = 'saving',
       progress_current = ?,
       progress_total = ?,
       progress_message = ?,
       imported_count = ?,
       created_count = ?,
       updated_count = ?,
       last_progress_at = ?
     WHERE id = ?`,
  ).run(
    input.current,
    Math.max(1, input.total),
    `본문 확인 및 저장 ${input.current}/${input.total}건`,
    input.current,
    input.createdCount,
    input.updatedCount,
    nowIso(),
    runId,
  );
}

function parseProgressStage(value: string): JudgmentCollectionProgressStage {
  if (
    value === "preparing" ||
    value === "listing" ||
    value === "saving" ||
    value === "finalizing" ||
    value === "done"
  ) {
    return value;
  }
  return "preparing";
}

function progressPercent(input: {
  current: number;
  stage: JudgmentCollectionProgressStage;
  status: string;
  total: number;
}) {
  if (input.status === "success" || input.status === "failed") {
    return 100;
  }
  if (input.stage === "listing") {
    return boundedPercent(
      progressStagePercent.listing +
        (input.current / Math.max(1, input.total)) * listingProgressWeight,
    );
  }
  if (input.stage === "saving") {
    return boundedPercent(
      progressStagePercent.saving +
        (input.current / Math.max(1, input.total)) * savingProgressWeight,
    );
  }
  return progressStagePercent[input.stage];
}

function boundedPercent(value: number) {
  return Math.min(99, Math.max(0, Math.round(value)));
}

function formatSavedMessage(count: number) {
  if (count === 0) {
    return "새로 저장할 데이터가 없어요.";
  }
  return `본문 확인 및 저장 ${count}/${count}건`;
}

function nextRunAtFromSettings(settings: JudgmentCollectionSettings) {
  return addMinutesIso(settings.intervalMinutes);
}

function addMinutesFromIso(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
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
