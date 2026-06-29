import { createHash } from "node:crypto";
import type { SqliteDatabase } from "./db";
import { newId } from "./security/crypto";
import { addMinutesIso, nowIso } from "./time";
import type { ExternalJudgmentRecord } from "./types";

const sampleExternalRecords: ExternalJudgmentRecord[] = [
  {
    sourceProvider: "korean-law-mcp",
    externalId: "seoul-admin-2023guhap54112",
    caseNumber: "2023구합54112",
    courtName: "서울행정법원",
    decidedOn: "2024-01-26",
    title: "학교폭력 처분 취소 청구 사건",
    sourceUrl: "https://jpri.scourt.go.kr",
    caseType: "administrative",
    summary: "청소년인 원고를 위해 쉬운 말 설명을 병기한 행정 판결 사례",
  },
  {
    sourceProvider: "korean-law-mcp",
    externalId: "criminal-easyread-sample-2",
    caseNumber: "2023고단000",
    courtName: "○○지방법원",
    decidedOn: "2023-12-12",
    title: "특수폭행 형사 판결 예시",
    sourceUrl: "https://jpri.scourt.go.kr",
    caseType: "criminal",
    summary: "형사 사건 Easy-Read 작성례 기반 샘플",
  },
  {
    sourceProvider: "korean-law-mcp",
    externalId: "civil-easyread-sample-1",
    caseNumber: "2024가단0000",
    courtName: "○○지방법원",
    decidedOn: "2024-04-15",
    title: "손해배상 청구 민사 판결 예시",
    sourceUrl: "https://jpri.scourt.go.kr",
    caseType: "civil",
    summary: "민사 사건 Easy-Read 작성례 기반 샘플",
  },
];

export async function searchExternalJudgments(query: string) {
  const normalized = query.trim().toLowerCase();
  return sampleExternalRecords.filter((record) => {
    return (
      record.caseNumber.toLowerCase().includes(normalized) ||
      record.title.toLowerCase().includes(normalized) ||
      record.courtName.toLowerCase().includes(normalized)
    );
  });
}

export function cacheExternalResponse(
  db: SqliteDatabase,
  provider: string,
  cacheKey: string,
  response: unknown,
) {
  const responseJson = JSON.stringify(response);
  const rawHash = createHash("sha256").update(responseJson).digest("hex");
  db.prepare(
    `INSERT INTO external_api_cache
      (id, provider, cache_key, response_json, raw_hash, fetched_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, cache_key)
      DO UPDATE SET
        response_json = excluded.response_json,
        raw_hash = excluded.raw_hash,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at`,
  ).run(
    newId("cache"),
    provider,
    cacheKey,
    responseJson,
    rawHash,
    nowIso(),
    addMinutesIso(60),
  );
}

export function upsertJudgmentFromExternal(
  db: SqliteDatabase,
  record: ExternalJudgmentRecord,
) {
  const now = nowIso();
  const existing = db
    .prepare<[string, string], { id: string }>(
      `SELECT id
        FROM judgments
        WHERE source_provider = ? AND source_external_id = ?`,
    )
    .get(record.sourceProvider, record.externalId);

  if (existing) {
    db.prepare(
      `UPDATE judgments
        SET case_number = ?,
          court_name = ?,
          decided_on = ?,
          title = ?,
          case_type = ?,
          source_url = ?,
          source_trust = 'external_verified',
          updated_at = ?
        WHERE id = ?`,
    ).run(
      record.caseNumber,
      record.courtName,
      record.decidedOn,
      record.title,
      record.caseType,
      record.sourceUrl ?? null,
      now,
      existing.id,
    );
    return existing.id;
  }

  const id = newId("judgment");
  db.prepare(
    `INSERT INTO judgments
      (id, case_number, court_name, decided_on, title, case_type, status,
        visibility, source_provider, source_external_id, source_url,
        source_trust, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    record.caseNumber,
    record.courtName,
    record.decidedOn,
    record.title,
    record.caseType,
    "pending",
    "public",
    record.sourceProvider,
    record.externalId,
    record.sourceUrl ?? null,
    "external_verified",
    now,
    now,
  );

  const raw = JSON.stringify(record);
  db.prepare(
    `INSERT INTO judgment_sources
      (id, judgment_id, provider, external_id, source_url, raw_hash, fetched_at, is_preferred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("source"),
    id,
    record.sourceProvider,
    record.externalId,
    record.sourceUrl ?? null,
    createHash("sha256").update(raw).digest("hex"),
    now,
    1,
  );

  return id;
}

export function mergeExternalFirst<T extends Record<string, unknown>>(
  external: T,
  generated: Partial<T>,
) {
  const conflicts: Array<{
    field: keyof T;
    external: unknown;
    generated: unknown;
  }> = [];
  const merged = { ...generated, ...external };

  for (const key of Object.keys(external) as Array<keyof T>) {
    if (generated[key] !== undefined && generated[key] !== external[key]) {
      conflicts.push({
        field: key,
        external: external[key],
        generated: generated[key],
      });
    }
  }

  return { merged, conflicts };
}

export async function syncSampleExternalCatalog(db: SqliteDatabase) {
  cacheExternalResponse(
    db,
    "korean-law-mcp",
    "sample-catalog",
    sampleExternalRecords,
  );

  return sampleExternalRecords.map((record) =>
    upsertJudgmentFromExternal(db, record),
  );
}
