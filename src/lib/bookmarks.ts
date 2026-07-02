import type { SqliteDatabase } from "./db";
import { displayJudgmentCaseType } from "./judgment-search";
import { newId } from "./security/crypto";
import { nowIso } from "./time";

export type BookmarkableJudgment = {
  caseNumber: string;
  caseType: string;
  courtName: string;
  decidedOn: string;
  id: string;
  title: string;
  visibility: string;
};

export function listBookmarkedJudgmentIds(db: SqliteDatabase, userId: string) {
  return db
    .prepare<[string], { judgment_id: string }>(
      `SELECT judgment_id
        FROM user_bookmarks
        WHERE user_id = ?`,
    )
    .all(userId)
    .map((row) => row.judgment_id);
}

export function isJudgmentBookmarked(
  db: SqliteDatabase,
  input: { judgmentId: string; userId: string },
) {
  const row = db
    .prepare<[string, string], { id: string }>(
      `SELECT id
        FROM user_bookmarks
        WHERE user_id = ? AND judgment_id = ?
        LIMIT 1`,
    )
    .get(input.userId, input.judgmentId);
  return Boolean(row);
}

export function addJudgmentBookmark(
  db: SqliteDatabase,
  input: { judgmentId: string; userId: string },
) {
  const judgment = getAccessibleJudgment(db, input);
  if (!judgment) {
    return { ok: false as const, reason: "not_found" as const };
  }

  db.prepare(
    `INSERT OR IGNORE INTO user_bookmarks
      (id, user_id, judgment_id, created_at)
      VALUES (?, ?, ?, ?)`,
  ).run(newId("bookmark"), input.userId, input.judgmentId, nowIso());
  return { ok: true as const };
}

export function removeJudgmentBookmark(
  db: SqliteDatabase,
  input: { judgmentId: string; userId: string },
) {
  db.prepare(
    `DELETE FROM user_bookmarks
      WHERE user_id = ? AND judgment_id = ?`,
  ).run(input.userId, input.judgmentId);
  return { ok: true as const };
}

export function listUserBookmarkRows(db: SqliteDatabase, userId: string) {
  return db
    .prepare<
      [string, string],
      BookmarkableJudgment & {
        bookmarked_at: string;
      }
    >(
      `SELECT judgments.id,
        judgments.case_number AS caseNumber,
        judgments.court_name AS courtName,
        judgments.decided_on AS decidedOn,
        judgments.title,
        judgments.case_type AS caseType,
        judgments.visibility,
        user_bookmarks.created_at AS bookmarked_at
      FROM user_bookmarks
      JOIN judgments ON judgments.id = user_bookmarks.judgment_id
      WHERE user_bookmarks.user_id = ?
        AND (
          judgments.visibility = 'public'
          OR judgments.created_by_user_id = ?
        )
      ORDER BY user_bookmarks.created_at DESC`,
    )
    .all(userId, userId)
    .map((row) => ({
      ...row,
      href: judgmentHref(row),
      label: `${displayJudgmentCaseType(row.caseType)} · ${visibilityLabel(row.visibility)}`,
      meta: `${row.courtName} · ${row.decidedOn}`,
      searchText: `${row.title} ${row.caseNumber} ${row.courtName} ${displayJudgmentCaseType(row.caseType)}`,
    }));
}

export function listUserPrivateJudgmentRows(
  db: SqliteDatabase,
  userId: string,
) {
  return db
    .prepare<[string], BookmarkableJudgment>(
      `SELECT id,
        case_number AS caseNumber,
        court_name AS courtName,
        decided_on AS decidedOn,
        title,
        case_type AS caseType,
        visibility
      FROM judgments
      WHERE visibility = 'private'
        AND created_by_user_id = ?
      ORDER BY created_at DESC`,
    )
    .all(userId)
    .map((row) => ({
      ...row,
      href: judgmentHref(row),
      label: "내가 등록한 문서",
      meta: `${row.courtName} · ${row.decidedOn}`,
      searchText: `${row.title} ${row.caseNumber} ${row.courtName}`,
    }));
}

function getAccessibleJudgment(
  db: SqliteDatabase,
  input: { judgmentId: string; userId: string },
) {
  return db
    .prepare<[string, string], { id: string }>(
      `SELECT id
        FROM judgments
        WHERE id = ?
          AND (
            visibility = 'public'
            OR created_by_user_id = ?
          )
        LIMIT 1`,
    )
    .get(input.judgmentId, input.userId);
}

function judgmentHref(
  judgment: Pick<BookmarkableJudgment, "id" | "visibility">,
) {
  return judgment.visibility === "private"
    ? `/cp/${encodeURIComponent(judgment.id)}`
    : `/p/${encodeURIComponent(judgment.id)}`;
}

function visibilityLabel(visibility: string) {
  if (visibility === "private") {
    return "내 문서";
  }
  if (visibility === "organization") {
    return "조직";
  }
  return "공개";
}
