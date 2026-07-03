import type { SqliteDatabase } from "./db";
import { nowIso } from "./time";

/**
 * 판결문·법령 원문은 corpus DB(legal-corpus.sqlite)의 judgment_texts에
 * 저장한다. 서비스 DB의 judgments에는 메타데이터만 남는다.
 */
export function setJudgmentText(
  db: SqliteDatabase,
  judgmentId: string,
  originalText: string,
) {
  db.prepare(
    `INSERT INTO judgment_texts (judgment_id, original_text, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(judgment_id) DO UPDATE SET
        original_text = excluded.original_text,
        updated_at = excluded.updated_at`,
  ).run(judgmentId, originalText, nowIso());
}

export function getJudgmentText(db: SqliteDatabase, judgmentId: string) {
  return (
    db
      .prepare<[string], { original_text: string }>(
        "SELECT original_text FROM judgment_texts WHERE judgment_id = ?",
      )
      .get(judgmentId)?.original_text ?? null
  );
}

export function deleteJudgmentText(db: SqliteDatabase, judgmentId: string) {
  db.prepare("DELETE FROM judgment_texts WHERE judgment_id = ?").run(
    judgmentId,
  );
}

export type FullTextHit = {
  judgmentId: string;
  snippet: string;
};

/**
 * 판결문 원문 전문 검색. 3자 이상 토큰은 trigram 인덱스(부분 문자열 매칭),
 * 2자 토큰은 unicode61 단어 인덱스(접두 매칭)로 찾은 뒤 병합한다.
 */
export function searchJudgmentTexts(
  db: SqliteDatabase,
  query: string,
  limit = 8,
): FullTextHit[] {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.replaceAll(/["'*^]/g, "").trim())
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  if (tokens.length === 0) {
    return [];
  }

  const trigramTokens = tokens.filter((token) => token.length >= 3);
  const shortTokens = tokens.filter((token) => token.length < 3);

  const hits: FullTextHit[] = [];
  const seen = new Set<string>();
  const collect = (rows: FullTextHit[]) => {
    for (const hit of rows) {
      if (!seen.has(hit.judgmentId)) {
        seen.add(hit.judgmentId);
        hits.push(hit);
      }
    }
  };

  if (trigramTokens.length > 0) {
    collect(
      runFtsQuery(
        db,
        "judgment_texts_fts",
        trigramTokens.map((token) => `"${token}"`).join(" OR "),
        limit,
      ),
    );
  }
  if (shortTokens.length > 0 && hits.length < limit) {
    collect(
      runFtsQuery(
        db,
        "judgment_words_fts",
        shortTokens.map((token) => `"${token}" *`).join(" OR "),
        limit,
      ),
    );
  }
  return hits.slice(0, limit);
}

function runFtsQuery(
  db: SqliteDatabase,
  table: "judgment_texts_fts" | "judgment_words_fts",
  match: string,
  limit: number,
): FullTextHit[] {
  try {
    return db
      .prepare<[string, number], { judgment_id: string; snippet: string }>(
        `SELECT judgment_texts.judgment_id,
          snippet(${table}, 0, '', '', ' … ', 24) AS snippet
         FROM ${table}
         JOIN judgment_texts ON judgment_texts.rowid = ${table}.rowid
         WHERE ${table} MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(match, limit)
      .map((row) => ({ judgmentId: row.judgment_id, snippet: row.snippet }));
  } catch {
    // FTS 질의 문법 오류 등은 검색 실패가 아니라 빈 결과로 처리한다.
    return [];
  }
}
