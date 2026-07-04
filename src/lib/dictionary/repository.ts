import type { SqliteDatabase } from "../db";
import { newId } from "../security/crypto";
import { nowIso } from "../time";
import { dedupeTerms } from "./extract";
import type { DictionarySource, DictionaryTerm } from "./types";
import { sourcePriority } from "./types";

export type LegalDictionaryTermRow = {
  definition: string;
  id: string;
  origin: string | null;
  partOfSpeech: string | null;
  senseNo: string;
  updatedAt: string;
  word: string;
};

export type DictionaryImportProgressStage =
  | "preparing"
  | "downloading"
  | "scanning"
  | "saving"
  | "finalizing"
  | "done";

export type DictionaryImportProgress = {
  current: number;
  failureReason: string | null;
  importId: string;
  importedCount: number;
  message: string;
  percent: number;
  source: DictionarySource;
  stage: DictionaryImportProgressStage;
  status: string;
  total: number;
};

const progressStagePercent: Record<DictionaryImportProgressStage, number> = {
  done: 100,
  downloading: 5,
  finalizing: 96,
  preparing: 0,
  saving: 35,
  scanning: 25,
};

const downloadingProgressWeight = 20;
const savingProgressWeight = 60;

export function findDictionaryTerms(db: SqliteDatabase, word: string) {
  return db
    .prepare<
      [string],
      {
        definition: string;
        origin: string | null;
        part_of_speech: string | null;
        sense_no: string;
        source: DictionarySource;
        word: string;
      }
    >(
      `WITH ranked_terms AS (
        SELECT word,
          sense_no,
          part_of_speech,
          definition,
          origin,
          source,
          ROW_NUMBER() OVER (
            PARTITION BY source
            ORDER BY CAST(NULLIF(sense_no, '') AS INTEGER),
              definition
          ) AS source_rank,
          CASE source
            WHEN 'legal' THEN 0
            WHEN 'basic' THEN 1
            WHEN 'standard' THEN 2
            ELSE 9
          END AS source_order
        FROM dictionary_terms
        WHERE word = ?
      )
      SELECT word, sense_no, part_of_speech, definition, origin, source
      FROM ranked_terms
      WHERE source_rank <= 4
      ORDER BY source_order ASC,
        source_rank ASC,
        definition
      LIMIT 12`,
    )
    .all(word.trim())
    .map((row) => ({
      definition: row.definition,
      origin: row.origin,
      partOfSpeech: row.part_of_speech,
      senseNo: row.sense_no,
      source: row.source,
      word: row.word,
    }));
}

export function searchDictionaryTerms(
  db: SqliteDatabase,
  input: {
    limit?: number;
    query: string;
    source: DictionarySource;
  },
) {
  const query = input.query.trim().replaceAll(/\s+/g, " ").slice(0, 300);
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 12);
  if (!query) {
    return [];
  }
  return db
    .prepare<
      [DictionarySource, string, string, string, string, number],
      {
        definition: string;
        origin: string | null;
        part_of_speech: string | null;
        sense_no: string;
        source: DictionarySource;
        word: string;
      }
    >(
      `SELECT word, sense_no, part_of_speech, definition, origin, source
       FROM dictionary_terms
       WHERE source = ?
         AND (
           word = ?
           OR ? LIKE '%' || word || '%'
           OR definition LIKE ?
         )
       ORDER BY CASE WHEN word = ? THEN 0 ELSE 1 END,
         LENGTH(word) DESC,
         CAST(NULLIF(sense_no, '') AS INTEGER),
         definition
       LIMIT ?`,
    )
    .all(input.source, query, query, `%${query}%`, query, limit)
    .map((row) => ({
      definition: row.definition,
      origin: row.origin,
      partOfSpeech: row.part_of_speech,
      senseNo: row.sense_no,
      source: row.source,
      word: row.word,
    }));
}

export function latestDictionaryImport(
  db: SqliteDatabase,
  source?: DictionarySource,
) {
  if (source) {
    return db
      .prepare<
        [DictionarySource],
        {
          completed_at: string | null;
          failure_reason: string | null;
          imported_count: number;
          source: DictionarySource;
          status: string;
        }
      >(
        `SELECT source, status, imported_count, failure_reason, completed_at
          FROM dictionary_imports
          WHERE source = ?
          ORDER BY created_at DESC
          LIMIT 1`,
      )
      .get(source);
  }

  return db
    .prepare<
      [],
      {
        completed_at: string | null;
        failure_reason: string | null;
        imported_count: number;
        source: DictionarySource;
        status: string;
      }
    >(
      `SELECT source, status, imported_count, failure_reason, completed_at
        FROM dictionary_imports
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get();
}

export function getDictionaryImportProgress(
  db: SqliteDatabase,
  source?: DictionarySource,
): DictionaryImportProgress | null {
  const selectSql = `SELECT id, source, status, imported_count, failure_reason,
      progress_stage, progress_current, progress_total, progress_message
    FROM dictionary_imports`;
  const orderSql = `ORDER BY created_at DESC LIMIT 1`;
  const row = source
    ? db
        .prepare<
          [DictionarySource],
          {
            failure_reason: string | null;
            id: string;
            imported_count: number;
            progress_current: number;
            progress_message: string;
            progress_stage: string;
            progress_total: number;
            source: DictionarySource;
            status: string;
          }
        >(`${selectSql} WHERE source = ? ${orderSql}`)
        .get(source)
    : db
        .prepare<
          [],
          {
            failure_reason: string | null;
            id: string;
            imported_count: number;
            progress_current: number;
            progress_message: string;
            progress_stage: string;
            progress_total: number;
            source: DictionarySource;
            status: string;
          }
        >(`${selectSql} ${orderSql}`)
        .get();

  if (!row) {
    return null;
  }

  const stage = parseDictionaryImportProgressStage(row.progress_stage);
  const total = Math.max(1, row.progress_total);
  return {
    current: row.progress_current,
    failureReason: row.failure_reason,
    importId: row.id,
    importedCount: row.imported_count,
    message: row.progress_message,
    percent: dictionaryImportProgressPercent({
      current: row.progress_current,
      stage,
      status: row.status,
      total,
    }),
    source: row.source,
    stage,
    status: row.status,
    total,
  };
}

export function listLegalDictionaryTerms(
  db: SqliteDatabase,
  query = "",
): LegalDictionaryTermRow[] {
  const trimmedQuery = query.trim();
  const selectSql = `SELECT id, word, sense_no, part_of_speech, definition, origin, updated_at
    FROM dictionary_terms
    WHERE source = 'legal'`;
  const orderSql = `ORDER BY updated_at DESC, word ASC
    LIMIT 100`;

  const rows = trimmedQuery
    ? db
        .prepare<
          [string, string],
          {
            definition: string;
            id: string;
            origin: string | null;
            part_of_speech: string | null;
            sense_no: string;
            updated_at: string;
            word: string;
          }
        >(
          `${selectSql}
            AND (word LIKE ? OR definition LIKE ?)
          ${orderSql}`,
        )
        .all(`%${trimmedQuery}%`, `%${trimmedQuery}%`)
    : db
        .prepare<
          [],
          {
            definition: string;
            id: string;
            origin: string | null;
            part_of_speech: string | null;
            sense_no: string;
            updated_at: string;
            word: string;
          }
        >(`${selectSql} ${orderSql}`)
        .all();

  return rows.map((row) => ({
    definition: row.definition,
    id: row.id,
    origin: row.origin,
    partOfSpeech: row.part_of_speech,
    senseNo: row.sense_no,
    updatedAt: row.updated_at,
    word: row.word,
  }));
}

export function startDictionaryImport(
  db: SqliteDatabase,
  input: { source: DictionarySource; sourceUrl: string },
) {
  const importId = newId("dictimport");
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO dictionary_imports
      (id, status, source, source_url, created_at, progress_stage,
        progress_current, progress_total, progress_message, last_progress_at)
      VALUES (?, 'running', ?, ?, ?, 'preparing', 0, 1, ?, ?)`,
  ).run(
    importId,
    input.source,
    input.sourceUrl,
    createdAt,
    "사전 업데이트 요청을 준비하고 있어요.",
    createdAt,
  );
  return importId;
}

export function completeDictionaryImport(
  db: SqliteDatabase,
  input: { importId: string; importedCount: number },
) {
  const completedAt = nowIso();
  const total = Math.max(1, input.importedCount);
  db.prepare(
    `UPDATE dictionary_imports
      SET status = 'completed',
          imported_count = ?,
          completed_at = ?,
          progress_stage = 'done',
          progress_current = ?,
          progress_total = ?,
          progress_message = ?,
          last_progress_at = ?
      WHERE id = ?`,
  ).run(
    input.importedCount,
    completedAt,
    total,
    total,
    formatDictionaryImportDoneMessage(input.importedCount),
    completedAt,
    input.importId,
  );
}

export function failDictionaryImport(
  db: SqliteDatabase,
  input: { importId: string; message: string },
) {
  const completedAt = nowIso();
  db.prepare(
    `UPDATE dictionary_imports
      SET status = 'failed',
          failure_reason = ?,
          completed_at = ?,
          progress_stage = 'done',
          progress_current = progress_total,
          progress_message = ?,
          last_progress_at = ?
      WHERE id = ?`,
  ).run(input.message, completedAt, input.message, completedAt, input.importId);
}

export function updateDictionaryImportProgress(
  db: SqliteDatabase,
  importId: string,
  input: {
    current: number;
    importedCount?: number;
    message: string;
    stage: DictionaryImportProgressStage;
    total: number;
  },
) {
  const total = Math.max(1, input.total);
  const current = Math.min(Math.max(0, input.current), total);
  const updatedAt = nowIso();
  if (typeof input.importedCount === "number") {
    db.prepare(
      `UPDATE dictionary_imports
       SET progress_stage = ?,
         progress_current = ?,
         progress_total = ?,
         progress_message = ?,
         imported_count = ?,
         last_progress_at = ?
       WHERE id = ?`,
    ).run(
      input.stage,
      current,
      total,
      input.message,
      input.importedCount,
      updatedAt,
      importId,
    );
    return;
  }

  db.prepare(
    `UPDATE dictionary_imports
     SET progress_stage = ?,
       progress_current = ?,
       progress_total = ?,
       progress_message = ?,
       last_progress_at = ?
     WHERE id = ?`,
  ).run(input.stage, current, total, input.message, updatedAt, importId);
}

export function upsertDictionaryTerms(
  db: SqliteDatabase,
  input: { source: DictionarySource; terms: readonly DictionaryTerm[] },
) {
  const uniqueTerms = dedupeTerms(
    input.terms.map((term) => ({ ...term, source: input.source })),
  );
  const priority = sourcePriority[input.source];
  const insert = db.prepare(
    `INSERT INTO dictionary_terms
      (id, source, priority, word, sense_no, part_of_speech,
        definition, origin, raw_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, word, sense_no, definition)
      DO UPDATE SET
        priority = excluded.priority,
        part_of_speech = excluded.part_of_speech,
        origin = excluded.origin,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at`,
  );
  const tx = db.transaction(() => {
    for (const term of uniqueTerms) {
      insert.run(
        newId("dict"),
        input.source,
        priority,
        term.word,
        term.senseNo,
        term.partOfSpeech,
        term.definition,
        term.origin,
        JSON.stringify({ ...term, source: input.source }),
        nowIso(),
      );
    }
  });
  tx();
  return uniqueTerms.length;
}

function parseDictionaryImportProgressStage(
  value: string,
): DictionaryImportProgressStage {
  if (
    value === "preparing" ||
    value === "downloading" ||
    value === "scanning" ||
    value === "saving" ||
    value === "finalizing" ||
    value === "done"
  ) {
    return value;
  }
  return "preparing";
}

function dictionaryImportProgressPercent(input: {
  current: number;
  stage: DictionaryImportProgressStage;
  status: string;
  total: number;
}) {
  if (input.status === "completed" || input.status === "failed") {
    return 100;
  }
  if (input.stage === "downloading") {
    return boundedPercent(
      progressStagePercent.downloading +
        (input.current / Math.max(1, input.total)) * downloadingProgressWeight,
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

function formatDictionaryImportDoneMessage(importedCount: number) {
  if (importedCount === 0) {
    return "새로 반영된 뜻풀이가 없습니다.";
  }
  return `${importedCount.toLocaleString("ko-KR")}개 뜻풀이를 반영했습니다.`;
}
