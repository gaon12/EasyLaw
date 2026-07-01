import { createHash } from "node:crypto";
import type { SqliteDatabase } from "./db";
import { logIntegrationEvent } from "./integration-events";
import { newId } from "./security/crypto";
import { getSetting } from "./settings";
import { addMinutesIso, nowIso } from "./time";
import type { ExternalJudgmentRecord } from "./types";

const OPEN_LAW_PROVIDER = "open-law";
const OPEN_LAW_DEFAULT_API_URL = "https://www.law.go.kr/DRF/lawSearch.do";

const sampleExternalRecords: ExternalJudgmentRecord[] = [
  {
    sourceProvider: "korean-law-mcp",
    externalId: "seoul-admin-2023guhap54112",
    caseNumber: "2023구합54112",
    courtName: "서울행정법원",
    decidedOn: "2024-01-26",
    title: "영업정지 처분 취소 청구 사건",
    sourceUrl: "https://jpri.scourt.go.kr",
    caseType: "administrative",
    summary: "취소소송 요건과 행정 처분 판단 구조를 보여주는 판결 예시",
    originalText:
      "원고는 영업정지 처분의 취소를 구하였고, 법원은 처분 사유와 절차, 비례 원칙 위반 여부를 중심으로 판단하였습니다.",
  },
  {
    sourceProvider: "korean-law-mcp",
    externalId: "criminal-easyread-sample-2",
    caseNumber: "2023고단000",
    courtName: "대전지방법원",
    decidedOn: "2023-12-12",
    title: "특수절도 형사 판결 예시",
    sourceUrl: "https://jpri.scourt.go.kr",
    caseType: "criminal",
    summary: "형사 사건 Easy-Read 작성을 위한 기반 샘플",
    originalText:
      "피고인의 행위가 특수절도죄의 구성요건에 해당하는지, 공모 관계와 양형 사유가 무엇인지 판단한 형사 판결 예시입니다.",
  },
  {
    sourceProvider: "korean-law-mcp",
    externalId: "civil-easyread-sample-1",
    caseNumber: "2024가단000",
    courtName: "대전지방법원",
    decidedOn: "2024-04-15",
    title: "손해배상 청구 민사 판결 예시",
    sourceUrl: "https://jpri.scourt.go.kr",
    caseType: "civil",
    summary: "민사 사건 Easy-Read 작성을 위한 기반 샘플",
    originalText:
      "원고는 손해배상을 청구하였고, 법원은 손해 발생, 인과관계, 배상 범위를 나누어 판단한 민사 판결 예시입니다.",
  },
];

type OpenLawSearchOptions = {
  display?: number;
  forceRefresh?: boolean;
  page?: number;
};

export async function searchExternalJudgments(
  db: SqliteDatabase,
  query: string,
) {
  const records = await fetchOpenLawJudgments(db, query, { display: 20 });
  if (records.length > 0) {
    return records;
  }

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
          source_summary = COALESCE(?, source_summary),
          original_text = COALESCE(?, original_text),
          updated_at = ?
        WHERE id = ?`,
    ).run(
      record.caseNumber,
      record.courtName,
      record.decidedOn,
      record.title,
      record.caseType,
      record.sourceUrl ?? null,
      record.summary ?? null,
      record.originalText ?? null,
      now,
      existing.id,
    );
    upsertJudgmentSource(db, existing.id, record, now);
    return existing.id;
  }

  const id = newId("judgment");
  db.prepare(
    `INSERT INTO judgments
      (id, case_number, court_name, decided_on, title, case_type, status,
        visibility, source_provider, source_external_id, source_url,
        source_trust, source_summary, original_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    record.summary ?? null,
    record.originalText ?? null,
    now,
    now,
  );

  upsertJudgmentSource(db, id, record, now);
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

export async function syncExternalCatalog(db: SqliteDatabase) {
  const records = await fetchOpenLawJudgments(db, "손해배상", { display: 20 });
  if (records.length === 0) {
    return syncSampleExternalCatalog(db);
  }
  return records.map((record) => upsertJudgmentFromExternal(db, record));
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

export async function fetchOpenLawJudgments(
  db: SqliteDatabase,
  query: string,
  options: OpenLawSearchOptions = {},
) {
  const oc = getOpenLawOc(db);
  if (!oc) {
    logIntegrationEvent(db, {
      action: "prec.search",
      message: "OC 키가 없어 공개법령 API 호출을 건너뛰었습니다.",
      service: OPEN_LAW_PROVIDER,
      status: "skipped",
    });
    return [];
  }

  const cacheKey = openLawCacheKey(query, options);
  const cached = options.forceRefresh
    ? null
    : readCachedOpenLawResponse(db, cacheKey);
  if (cached) {
    logIntegrationEvent(db, {
      action: "prec.search.cache",
      message: "캐시된 공개법령 API 응답을 사용했습니다.",
      metadata: { query, ...options },
      service: OPEN_LAW_PROVIDER,
      status: "success",
    });
    return parseOpenLawSearchResponse(cached);
  }

  const url = new URL(OPEN_LAW_DEFAULT_API_URL);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "prec");
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", String(options.display ?? 20));
  url.searchParams.set("page", String(options.page ?? 1));
  if (query.trim()) {
    url.searchParams.set("query", query.trim());
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      logIntegrationEvent(db, {
        action: "prec.search",
        message: `공개법령 API가 ${response.status} 상태를 반환했습니다.`,
        metadata: { query, status: response.status, ...options },
        service: OPEN_LAW_PROVIDER,
        status: "failed",
      });
      return [];
    }

    const payload = (await response.json()) as unknown;
    cacheExternalResponse(db, OPEN_LAW_PROVIDER, cacheKey, payload);
    const records = parseOpenLawSearchResponse(payload);
    logIntegrationEvent(db, {
      action: "prec.search",
      message: `${records.length.toLocaleString("ko-KR")}건의 판례 후보를 가져왔습니다.`,
      metadata: { count: records.length, query, ...options },
      service: OPEN_LAW_PROVIDER,
      status: "success",
    });
    return records;
  } catch (error) {
    logIntegrationEvent(db, {
      action: "prec.search",
      message:
        error instanceof Error ? error.message : "공개법령 API 호출 실패",
      metadata: { query, ...options },
      service: OPEN_LAW_PROVIDER,
      status: "failed",
    });
    return [];
  }
}

export async function ensurePublicJudgmentOriginalText(
  db: SqliteDatabase,
  input: {
    id: string;
    originalText: string | null;
    sourceUrl: string | null;
    sourceProvider: string;
  },
) {
  if (input.originalText || input.sourceProvider !== OPEN_LAW_PROVIDER) {
    return input.originalText;
  }

  const originalText = await fetchOpenLawOriginalText(db, input.sourceUrl);
  if (!originalText) {
    return null;
  }

  db.prepare(
    `UPDATE judgments
      SET original_text = ?, updated_at = ?
      WHERE id = ?`,
  ).run(originalText, nowIso(), input.id);
  return originalText;
}

export function parseOpenLawSearchResponse(
  payload: unknown,
): ExternalJudgmentRecord[] {
  const root = objectValue(payload, "PrecSearch") ?? payload;
  const items =
    arrayValue(root, "prec") ??
    arrayValue(root, "Prec") ??
    arrayValue(root, "item") ??
    [];

  return items
    .map((item) => parseOpenLawItem(item))
    .filter((item): item is ExternalJudgmentRecord => Boolean(item));
}

function parseOpenLawItem(item: unknown): ExternalJudgmentRecord | null {
  if (!isRecord(item)) {
    return null;
  }

  const externalId =
    stringValue(item, "판례일련번호") ??
    stringValue(item, "precSeq") ??
    stringValue(item, "id");
  const caseNumber =
    stringValue(item, "사건번호") ?? stringValue(item, "caseNumber");
  const caseName = stringValue(item, "사건명");
  const summary = stringValue(item, "판시사항") ?? stringValue(item, "summary");
  const title = buildOpenLawTitle({
    fallbackTitle:
      stringValue(item, "판례명") ?? stringValue(item, "title") ?? caseNumber,
    caseName,
    summary,
  });
  const courtName =
    stringValue(item, "법원명") ?? stringValue(item, "courtName") ?? "법원";
  const decidedOn = normalizeDate(
    stringValue(item, "선고일자") ?? stringValue(item, "decidedOn"),
  );

  if (!externalId || !caseNumber || !title || !decidedOn) {
    return null;
  }

  const sourceUrl = normalizeOpenLawUrl(
    stringValue(item, "판례상세링크") ?? stringValue(item, "detailLink"),
  );

  return {
    sourceProvider: OPEN_LAW_PROVIDER,
    externalId,
    caseNumber,
    courtName,
    decidedOn,
    title,
    sourceUrl,
    caseType: classifyCaseType(caseNumber, title),
    summary,
    originalText: openLawOriginalText(item),
  };
}

async function fetchOpenLawOriginalText(
  db: SqliteDatabase,
  sourceUrl: string | null,
) {
  if (!sourceUrl) {
    return null;
  }

  const url = openLawJsonUrl(sourceUrl, getOpenLawOc(db) ?? undefined);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return null;
    }
    return parseOpenLawOriginalText((await response.json()) as unknown);
  } catch (_error) {
    return null;
  }
}

function parseOpenLawOriginalText(payload: unknown) {
  const root = objectValue(payload, "PrecService") ?? payload;
  return openLawOriginalText(root);
}

function openLawOriginalText(item: unknown) {
  return stringValue(item, "판례내용") ?? stringValue(item, "내용");
}

function openLawJsonUrl(value: string, oc: string | undefined) {
  const url = new URL(value);
  url.searchParams.set("target", "prec");
  url.searchParams.set("type", "JSON");
  if (oc && !url.searchParams.get("OC")) {
    url.searchParams.set("OC", oc);
  }
  return url;
}

function buildOpenLawTitle(input: {
  caseName: string | undefined;
  fallbackTitle: string | undefined;
  summary: string | undefined;
}) {
  const title = input.caseName ?? input.fallbackTitle;
  if (!title) {
    return undefined;
  }

  const leadingMarker = input.summary?.match(
    /^\s*(\([^()\n]{1,40}\)|\[[^[\]\n]{1,40}\]|【[^】\n]{1,40}】)\s*/,
  )?.[1];
  if (!input.caseName || !leadingMarker || title.startsWith(leadingMarker)) {
    return title;
  }
  return `${leadingMarker} ${title}`;
}

function upsertJudgmentSource(
  db: SqliteDatabase,
  judgmentId: string,
  record: ExternalJudgmentRecord,
  fetchedAt: string,
) {
  const raw = JSON.stringify(record);
  const rawHash = createHash("sha256").update(raw).digest("hex");
  const existing = db
    .prepare<[string, string, string], { id: string }>(
      `SELECT id
        FROM judgment_sources
        WHERE judgment_id = ? AND provider = ? AND external_id = ?`,
    )
    .get(judgmentId, record.sourceProvider, record.externalId);

  if (existing) {
    db.prepare(
      `UPDATE judgment_sources
        SET source_url = ?, raw_hash = ?, fetched_at = ?, is_preferred = 1
        WHERE id = ?`,
    ).run(record.sourceUrl ?? null, rawHash, fetchedAt, existing.id);
    return;
  }

  db.prepare(
    `INSERT INTO judgment_sources
      (id, judgment_id, provider, external_id, source_url, raw_hash, fetched_at, is_preferred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("source"),
    judgmentId,
    record.sourceProvider,
    record.externalId,
    record.sourceUrl ?? null,
    rawHash,
    fetchedAt,
    1,
  );
}

function getOpenLawOc(db: SqliteDatabase) {
  return (
    getSetting(db, "open_law_oc") ??
    getSetting(db, "open_law_api_key") ??
    getSetting(db, "law_open_api_oc")
  );
}

function openLawCacheKey(query: string, options: OpenLawSearchOptions) {
  const params = new URLSearchParams({
    display: String(options.display ?? 20),
    page: String(options.page ?? 1),
    query: query.trim(),
    target: "prec",
    type: "JSON",
  });
  return params.toString();
}

function readCachedOpenLawResponse(db: SqliteDatabase, cacheKey: string) {
  const row = db
    .prepare<[string, string, string], { response_json: string }>(
      `SELECT response_json
        FROM external_api_cache
        WHERE provider = ? AND cache_key = ? AND expires_at > ?
        LIMIT 1`,
    )
    .get(OPEN_LAW_PROVIDER, cacheKey, nowIso());
  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.response_json) as unknown;
  } catch (_error) {
    return null;
  }
}

function normalizeDate(value: string | undefined) {
  const digits = value?.replaceAll(/\D/g, "") ?? "";
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function normalizeOpenLawUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return new URL(value, "https://www.law.go.kr").toString();
}

function classifyCaseType(
  caseNumber: string,
  title: string,
): ExternalJudgmentRecord["caseType"] {
  const text = `${caseNumber} ${title}`;
  if (/고단|고합|도|형/.test(text)) {
    return "criminal";
  }
  if (/구합|구단|행정|처분|취소/.test(text)) {
    return "administrative";
  }
  if (/드단|드합|느단|가족|이혼/.test(text)) {
    return "family";
  }
  return "civil";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(source: unknown, key: string) {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectValue(source: unknown, key: string) {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  return isRecord(value) ? value : undefined;
}

function arrayValue(source: unknown, key: string) {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : undefined;
}
