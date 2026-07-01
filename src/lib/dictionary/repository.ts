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
      `SELECT word, sense_no, part_of_speech, definition, origin, source
        FROM dictionary_terms
        WHERE word = ?
        ORDER BY priority ASC,
          CAST(NULLIF(sense_no, '') AS INTEGER),
          definition
        LIMIT 8`,
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
  db.prepare(
    `INSERT INTO dictionary_imports
      (id, status, source, source_url, created_at)
      VALUES (?, 'running', ?, ?, ?)`,
  ).run(importId, input.source, input.sourceUrl, nowIso());
  return importId;
}

export function completeDictionaryImport(
  db: SqliteDatabase,
  input: { importId: string; importedCount: number },
) {
  db.prepare(
    `UPDATE dictionary_imports
      SET status = 'completed',
          imported_count = ?,
          completed_at = ?
      WHERE id = ?`,
  ).run(input.importedCount, nowIso(), input.importId);
}

export function failDictionaryImport(
  db: SqliteDatabase,
  input: { importId: string; message: string },
) {
  db.prepare(
    `UPDATE dictionary_imports
      SET status = 'failed',
          failure_reason = ?,
          completed_at = ?
      WHERE id = ?`,
  ).run(input.message, nowIso(), input.importId);
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
