import { createHash } from "node:crypto";
import type { SqliteDatabase } from "./db";
import { logIntegrationEvent } from "./integration-events";
import { setJudgmentText } from "./judgment-texts";
import { newId } from "./security/crypto";
import { getSetting } from "./settings";
import { addMinutesIso, nowIso } from "./time";
import type { ExternalJudgmentRecord } from "./types";

const OPEN_LAW_SEARCH_API_URL = "https://www.law.go.kr/DRF/lawSearch.do";
const OPEN_LAW_SERVICE_API_URL = "https://www.law.go.kr/DRF/lawService.do";

export const openLawCollectionTargets = [
  "prec",
  "detc",
  "law",
  "admrul",
  "ordin",
] as const;
export type OpenLawTarget = (typeof openLawCollectionTargets)[number];

type OpenLawTargetConfig = {
  provider: string;
  rootKeys: string[];
  serviceRootKeys: string[];
  itemKeys: string[];
  searchAction: string;
  cacheAction: string;
  label: string;
};

const openLawTargetConfigs: Record<OpenLawTarget, OpenLawTargetConfig> = {
  prec: {
    provider: "open-law",
    rootKeys: ["PrecSearch"],
    serviceRootKeys: ["PrecService"],
    itemKeys: ["prec", "Prec", "item"],
    searchAction: "prec.search",
    cacheAction: "prec.search.cache",
    label: "판례",
  },
  detc: {
    provider: "open-law-constitutional",
    rootKeys: ["DetcSearch"],
    serviceRootKeys: ["DetcService"],
    itemKeys: ["detc", "Detc", "item"],
    searchAction: "detc.search",
    cacheAction: "detc.search.cache",
    label: "헌재결정례",
  },
  law: {
    provider: "open-law-law",
    rootKeys: ["LawSearch"],
    serviceRootKeys: ["LawService"],
    itemKeys: ["law", "Law", "item"],
    searchAction: "law.search",
    cacheAction: "law.search.cache",
    label: "법령",
  },
  admrul: {
    provider: "open-law-administrative-rule",
    rootKeys: ["AdmRulSearch", "AdmrulSearch"],
    serviceRootKeys: ["AdmRulService", "AdmrulService"],
    itemKeys: ["admrul", "AdmRul", "item"],
    searchAction: "admrul.search",
    cacheAction: "admrul.search.cache",
    label: "행정규칙",
  },
  ordin: {
    provider: "open-law-ordinance",
    rootKeys: ["OrdinSearch"],
    serviceRootKeys: ["OrdinService"],
    itemKeys: ["ordin", "Ordin", "item"],
    searchAction: "ordin.search",
    cacheAction: "ordin.search.cache",
    label: "자치법규",
  },
};

type OpenLawSearchOptions = {
  display?: number;
  forceRefresh?: boolean;
  page?: number;
};

export type OpenLawRecordPage = {
  records: ExternalJudgmentRecord[];
  totalCount: number | null;
};

export async function searchExternalJudgments(
  db: SqliteDatabase,
  query: string,
) {
  return fetchOpenLawJudgments(db, query, { display: 20 });
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
  const result = upsertJudgmentsFromExternal(db, [record])[0];
  return result.id;
}

export function upsertJudgmentsFromExternal(
  db: SqliteDatabase,
  records: ExternalJudgmentRecord[],
) {
  const selectJudgment = db.prepare<[string, string], { id: string }>(
    `SELECT id
      FROM judgments
      WHERE source_provider = ? AND source_external_id = ?`,
  );
  const updateJudgment = db.prepare(
    `UPDATE judgments
        SET case_number = ?,
          court_name = ?,
          decided_on = ?,
          title = ?,
          case_type = ?,
          source_url = ?,
          source_trust = 'external_verified',
          source_summary = COALESCE(?, source_summary),
          updated_at = ?
        WHERE id = ?`,
  );
  const insertJudgment = db.prepare(
    `INSERT INTO judgments
      (id, case_number, court_name, decided_on, title, case_type, status,
        visibility, source_provider, source_external_id, source_url,
        source_trust, source_summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const upsertText = db.prepare(
    `INSERT INTO judgment_texts (judgment_id, original_text, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(judgment_id) DO UPDATE SET
        original_text = excluded.original_text,
        updated_at = excluded.updated_at`,
  );
  const selectSource = db.prepare<[string, string, string], { id: string }>(
    `SELECT id
      FROM judgment_sources
      WHERE judgment_id = ? AND provider = ? AND external_id = ?`,
  );
  const updateSource = db.prepare(
    `UPDATE judgment_sources
      SET source_url = ?, raw_hash = ?, fetched_at = ?, is_preferred = 1
      WHERE id = ?`,
  );
  const insertSource = db.prepare(
    `INSERT INTO judgment_sources
      (id, judgment_id, provider, external_id, source_url, raw_hash, fetched_at, is_preferred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return db.transaction((items: ExternalJudgmentRecord[]) => {
    const results: Array<{ created: boolean; id: string }> = [];
    for (const record of items) {
      const now = nowIso();
      const existing = selectJudgment.get(
        record.sourceProvider,
        record.externalId,
      );
      const id = existing?.id ?? newId("judgment");

      if (existing) {
        updateJudgment.run(
          record.caseNumber,
          record.courtName,
          record.decidedOn,
          record.title,
          record.caseType,
          record.sourceUrl ?? null,
          record.summary ?? null,
          now,
          id,
        );
      } else {
        insertJudgment.run(
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
          now,
          now,
        );
      }

      if (record.originalText) {
        upsertText.run(id, record.originalText, now);
      }
      const raw = JSON.stringify(record);
      const rawHash = createHash("sha256").update(raw).digest("hex");
      const source = selectSource.get(
        id,
        record.sourceProvider,
        record.externalId,
      );
      if (source) {
        updateSource.run(record.sourceUrl ?? null, rawHash, now, source.id);
      } else {
        insertSource.run(
          newId("source"),
          id,
          record.sourceProvider,
          record.externalId,
          record.sourceUrl ?? null,
          rawHash,
          now,
          1,
        );
      }

      results.push({ created: !existing, id });
    }
    return results;
  })(records);
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
  return upsertJudgmentsFromExternal(db, records).map((result) => result.id);
}

export async function fetchOpenLawJudgments(
  db: SqliteDatabase,
  query: string,
  options: OpenLawSearchOptions = {},
) {
  return fetchOpenLawRecords(db, "prec", query, options);
}

export async function fetchOpenLawRecords(
  db: SqliteDatabase,
  target: OpenLawTarget,
  query: string,
  options: OpenLawSearchOptions = {},
) {
  const page = await fetchOpenLawRecordPage(db, target, query, options);
  return page.records;
}

export async function fetchOpenLawRecordPage(
  db: SqliteDatabase,
  target: OpenLawTarget,
  query: string,
  options: OpenLawSearchOptions = {},
): Promise<OpenLawRecordPage> {
  const config = openLawTargetConfigs[target];
  const oc = getOpenLawOc(db);
  if (!oc) {
    logIntegrationEvent(db, {
      action: config.searchAction,
      message: "OC 키가 없어 공개법령 API 호출을 건너뛰었습니다.",
      service: config.provider,
      status: "skipped",
    });
    return { records: [], totalCount: null };
  }

  const cacheKey = openLawCacheKey(target, query, options);
  const cached = options.forceRefresh
    ? null
    : readCachedOpenLawResponse(db, config.provider, cacheKey);
  if (cached) {
    logIntegrationEvent(db, {
      action: config.cacheAction,
      message: "캐시된 공개법령 API 응답을 사용했습니다.",
      metadata: { query, target, ...options },
      service: config.provider,
      status: "success",
    });
    return parseOpenLawRecordPage(cached, target);
  }

  const url = new URL(OPEN_LAW_SEARCH_API_URL);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", target);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", String(options.display ?? 20));
  url.searchParams.set("page", String(options.page ?? 1));
  setDefaultSort(url, target);
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
        action: config.searchAction,
        message: `공개법령 API가 ${response.status} 상태를 반환했습니다.`,
        metadata: { query, status: response.status, target, ...options },
        service: config.provider,
        status: "failed",
      });
      return { records: [], totalCount: null };
    }

    const payload = (await response.json()) as unknown;
    cacheExternalResponse(db, config.provider, cacheKey, payload);
    const page = parseOpenLawRecordPage(payload, target);
    logIntegrationEvent(db, {
      action: config.searchAction,
      message: `${page.records.length.toLocaleString("ko-KR")}건의 ${config.label} 후보를 가져왔습니다.`,
      metadata: { count: page.records.length, query, target, ...options },
      service: config.provider,
      status: "success",
    });
    return page;
  } catch (error) {
    logIntegrationEvent(db, {
      action: config.searchAction,
      message:
        error instanceof Error ? error.message : "공개법령 API 호출 실패",
      metadata: { query, target, ...options },
      service: config.provider,
      status: "failed",
    });
    return { records: [], totalCount: null };
  }
}

export async function ensurePublicJudgmentOriginalText(
  db: SqliteDatabase,
  input: {
    id: string;
    originalText: string | null;
    sourceUrl: string | null;
    sourceProvider: string;
    sourceExternalId?: string;
    caseNumber?: string;
    title?: string;
  },
) {
  if (input.originalText && !isTruncatedOriginalText(input.originalText)) {
    return input.originalText;
  }

  const target = targetFromProvider(input.sourceProvider);
  if (!target) {
    return null;
  }

  const originalText = await fetchOpenLawOriginalText(db, {
    caseNumber: input.caseNumber,
    externalId: input.sourceExternalId,
    sourceUrl: input.sourceUrl,
    target,
    title: input.title,
  });
  if (!originalText) {
    return null;
  }

  setJudgmentText(db, input.id, originalText);
  return originalText;
}

export async function hydrateOpenLawRecordOriginalText(
  db: SqliteDatabase,
  record: ExternalJudgmentRecord,
) {
  if (record.originalText) {
    return record;
  }

  const target = targetFromProvider(record.sourceProvider);
  if (!target) {
    return record;
  }

  const originalText = await fetchOpenLawOriginalText(db, {
    caseNumber: record.caseNumber,
    externalId: record.externalId,
    sourceUrl: record.sourceUrl ?? null,
    target,
    title: record.title,
  });
  return originalText ? { ...record, originalText } : record;
}

export function parseOpenLawSearchResponse(
  payload: unknown,
  target: OpenLawTarget = "prec",
): ExternalJudgmentRecord[] {
  return parseOpenLawRecordPage(payload, target).records;
}

function parseOpenLawRecordPage(
  payload: unknown,
  target: OpenLawTarget,
): OpenLawRecordPage {
  const config = openLawTargetConfigs[target];
  const root = findOpenLawRoot(payload, config.rootKeys, config.itemKeys);
  const items = config.itemKeys.flatMap((key) => arrayValue(root, key) ?? []);

  return {
    records: items
      .map((item) => parseOpenLawItem(item, target))
      .filter((item): item is ExternalJudgmentRecord => Boolean(item)),
    totalCount: parseOpenLawTotalCount(root),
  };
}

function parseOpenLawTotalCount(root: unknown) {
  const total =
    textValue(root, "totalCnt") ??
    textValue(root, "totalCount") ??
    textValue(root, "totalcnt");
  if (!total) {
    return null;
  }
  const count = Number.parseInt(total, 10);
  return Number.isFinite(count) ? count : null;
}

function parseOpenLawItem(
  item: unknown,
  target: OpenLawTarget,
): ExternalJudgmentRecord | null {
  if (!isRecord(item)) {
    return null;
  }

  if (target === "detc") {
    return parseConstitutionalItem(item);
  }
  if (target === "law") {
    return parseLawItem(item);
  }
  if (target === "admrul") {
    return parseAdministrativeRuleItem(item);
  }
  if (target === "ordin") {
    return parseOrdinanceItem(item);
  }
  return parsePrecedentItem(item);
}

function parsePrecedentItem(
  item: Record<string, unknown>,
): ExternalJudgmentRecord | null {
  const externalId =
    textValue(item, "판례일련번호") ??
    textValue(item, "판례정보일련번호") ??
    textValue(item, "precSeq") ??
    textValue(item, "ID") ??
    textValue(item, "id");
  const caseNumber =
    textValue(item, "사건번호") ?? textValue(item, "caseNumber");
  const caseName = textValue(item, "사건명");
  const summary = textValue(item, "판시사항") ?? textValue(item, "summary");
  const title = buildOpenLawTitle({
    fallbackTitle:
      textValue(item, "판례명") ?? textValue(item, "title") ?? caseNumber,
    caseName,
    summary,
  });
  const courtName =
    textValue(item, "법원명") ?? textValue(item, "courtName") ?? "법원";
  const decidedOn = normalizeDate(
    textValue(item, "선고일자") ?? textValue(item, "decidedOn"),
  );

  if (!externalId || !caseNumber || !title || !decidedOn) {
    return null;
  }

  const sourceUrl =
    normalizeOpenLawUrl(
      textValue(item, "판례상세링크") ?? textValue(item, "detailLink"),
    ) ?? openLawPublicServiceUrl("prec", externalId);

  return {
    sourceProvider: openLawTargetConfigs.prec.provider,
    externalId,
    caseNumber,
    courtName,
    decidedOn,
    title,
    sourceUrl,
    caseType: classifyCaseType(caseNumber, title),
    summary,
    originalText: openLawOriginalText(item, "prec"),
  };
}

function parseConstitutionalItem(
  item: Record<string, unknown>,
): ExternalJudgmentRecord | null {
  const externalId =
    textValue(item, "헌재결정례일련번호") ??
    textValue(item, "detcSeq") ??
    textValue(item, "ID") ??
    textValue(item, "id");
  const caseNumber =
    textValue(item, "사건번호") ?? textValue(item, "caseNumber");
  const title =
    textValue(item, "사건명") ??
    textValue(item, "헌재결정례명") ??
    textValue(item, "title") ??
    caseNumber;
  const decidedOn = normalizeDate(
    textValue(item, "종국일자") ??
      textValue(item, "선고일자") ??
      textValue(item, "decidedOn"),
  );

  if (!externalId || !caseNumber || !title || !decidedOn) {
    return null;
  }

  const sourceUrl =
    normalizeOpenLawUrl(
      textValue(item, "헌재결정례상세링크") ??
        textValue(item, "헌재결정례 상세링크") ??
        textValue(item, "detailLink"),
    ) ?? openLawPublicServiceUrl("detc", externalId);

  return {
    sourceProvider: openLawTargetConfigs.detc.provider,
    externalId,
    caseNumber,
    courtName: "헌법재판소",
    decidedOn,
    title,
    sourceUrl,
    caseType: "constitutional",
    summary: textValue(item, "판시사항") ?? textValue(item, "결정요지"),
    originalText: openLawOriginalText(item, "detc"),
  };
}

function parseLawItem(
  item: Record<string, unknown>,
): ExternalJudgmentRecord | null {
  const lawId = textValue(item, "법령ID") ?? textValue(item, "ID");
  const masterId =
    textValue(item, "법령일련번호") ??
    textValue(item, "MST") ??
    textValue(item, "id");
  const externalId = lawId ?? masterId;
  const title =
    textValue(item, "법령명한글") ??
    textValue(item, "법령명_한글") ??
    textValue(item, "법령명") ??
    textValue(item, "title");
  const decidedOn = normalizeDate(
    textValue(item, "시행일자") ??
      textValue(item, "공포일자") ??
      textValue(item, "decidedOn"),
  );

  if (!externalId || !title || !decidedOn) {
    return null;
  }

  const sourceUrl =
    normalizeOpenLawUrl(
      textValue(item, "법령상세링크") ?? textValue(item, "detailLink"),
    ) ?? openLawPublicServiceUrl("law", externalId);
  const announcementNumber = textValue(item, "공포번호");
  const caseNumber = announcementNumber
    ? `법령 ${externalId}-${announcementNumber}`
    : `법령 ${externalId}`;
  const ministry = textValue(item, "소관부처명") ?? "법제처";
  const lawKind = textValue(item, "법령구분명");

  return {
    sourceProvider: openLawTargetConfigs.law.provider,
    externalId,
    caseNumber,
    courtName: ministry,
    decidedOn,
    title,
    sourceUrl,
    caseType: "law",
    summary: [lawKind, textValue(item, "제개정구분명")]
      .filter(Boolean)
      .join(" / "),
    originalText: openLawOriginalText(item, "law"),
  };
}

function parseAdministrativeRuleItem(
  item: Record<string, unknown>,
): ExternalJudgmentRecord | null {
  const sequenceId = textValue(item, "행정규칙일련번호");
  const ruleId = textValue(item, "행정규칙ID") ?? textValue(item, "ID");
  const externalId =
    ruleId ?? sequenceId ?? textValue(item, "MST") ?? textValue(item, "id");
  const title = textValue(item, "행정규칙명") ?? textValue(item, "title");
  const decidedOn = normalizeDate(
    textValue(item, "시행일자") ??
      textValue(item, "발령일자") ??
      textValue(item, "생성일자") ??
      textValue(item, "decidedOn"),
  );

  if (!externalId || !title || !decidedOn) {
    return null;
  }

  const sourceUrl =
    normalizeOpenLawUrl(
      textValue(item, "행정규칙상세링크") ?? textValue(item, "detailLink"),
    ) ?? openLawPublicServiceUrl("admrul", externalId);
  const announcementNumber = textValue(item, "발령번호");
  const caseNumber = announcementNumber
    ? `행정규칙 ${externalId}-${announcementNumber}`
    : `행정규칙 ${externalId}`;

  return {
    sourceProvider: openLawTargetConfigs.admrul.provider,
    externalId,
    caseNumber,
    courtName: textValue(item, "소관부처명") ?? "법제처",
    decidedOn,
    title,
    sourceUrl,
    caseType: "law",
    summary: [
      textValue(item, "행정규칙종류"),
      textValue(item, "제개정구분명"),
      textValue(item, "현행연혁구분"),
    ]
      .filter(Boolean)
      .join(" / "),
    originalText: openLawOriginalText(item, "admrul"),
  };
}

function parseOrdinanceItem(
  item: Record<string, unknown>,
): ExternalJudgmentRecord | null {
  const sequenceId = textValue(item, "자치법규일련번호");
  const ordinanceId = textValue(item, "자치법규ID") ?? textValue(item, "ID");
  const externalId =
    ordinanceId ??
    sequenceId ??
    textValue(item, "MST") ??
    textValue(item, "id");
  const title = textValue(item, "자치법규명") ?? textValue(item, "title");
  const decidedOn = normalizeDate(
    textValue(item, "시행일자") ??
      textValue(item, "공포일자") ??
      textValue(item, "decidedOn"),
  );

  if (!externalId || !title || !decidedOn) {
    return null;
  }

  const sourceUrl =
    normalizeOpenLawUrl(
      textValue(item, "자치법규상세링크") ?? textValue(item, "detailLink"),
    ) ?? openLawPublicServiceUrl("ordin", externalId);
  const announcementNumber = textValue(item, "공포번호");
  const caseNumber = announcementNumber
    ? `자치법규 ${externalId}-${announcementNumber}`
    : `자치법규 ${externalId}`;

  return {
    sourceProvider: openLawTargetConfigs.ordin.provider,
    externalId,
    caseNumber,
    courtName: textValue(item, "지자체기관명") ?? "지방자치단체",
    decidedOn,
    title,
    sourceUrl,
    caseType: "law",
    summary: [
      textValue(item, "자치법규종류"),
      textValue(item, "제개정구분명"),
      textValue(item, "자치법규분야명"),
    ]
      .filter(Boolean)
      .join(" / "),
    originalText: openLawOriginalText(item, "ordin"),
  };
}

async function fetchOpenLawOriginalText(
  db: SqliteDatabase,
  input: {
    caseNumber?: string;
    externalId?: string;
    sourceUrl: string | null;
    target: OpenLawTarget;
    title?: string;
  },
) {
  const oc = getOpenLawOc(db);
  if (!oc) {
    return null;
  }

  const detailUrl = openLawJsonUrl(input, oc);
  const jsonText = detailUrl
    ? await fetchOpenLawJsonText(detailUrl, input.target)
    : null;
  if (jsonText) {
    return jsonText;
  }

  return (
    (await fetchOpenLawHtmlFallback(input)) ??
    (input.target === "prec" ? await fetchNtsTaxLawPrecedentText(input) : null)
  );
}

async function fetchOpenLawJsonText(url: URL, target: OpenLawTarget) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return null;
    }
    return parseOpenLawOriginalText((await response.json()) as unknown, target);
  } catch (_error) {
    return null;
  }
}

async function fetchOpenLawHtmlFallback(input: {
  caseNumber?: string;
  externalId?: string;
  sourceUrl: string | null;
  target: OpenLawTarget;
  title?: string;
}) {
  const htmlUrl =
    input.sourceUrl ?? openLawPublicServiceUrl(input.target, input.externalId);
  if (!htmlUrl) {
    return null;
  }

  const html = await fetchText(htmlUrl);
  if (!html) {
    return null;
  }

  const frameUrl = extractHtmlAttribute(html, "iframe", "src");
  if (frameUrl) {
    const frameText = await fetchText(new URL(frameUrl, htmlUrl).toString());
    const normalizedFrameText = htmlToPlainText(frameText);
    if (isUsefulOriginalText(normalizedFrameText)) {
      return normalizedFrameText;
    }
  }

  const mobileText = await fetchOpenLawMobilePrecedentText(html, htmlUrl);
  if (mobileText) {
    return mobileText;
  }

  const normalizedText = htmlToPlainText(html);
  return isUsefulOriginalText(normalizedText) ? normalizedText : null;
}

async function fetchNtsTaxLawPrecedentText(input: {
  caseNumber?: string;
  title?: string;
}) {
  const expectedTitle = normalizeComparableText(input.title);
  const expectedCaseNumber = normalizeComparableText(input.caseNumber);
  if (!expectedTitle && !expectedCaseNumber) {
    return null;
  }

  for (let startCount = 1; startCount <= 5; startCount += 1) {
    const payload = await fetchNtsTaxLawAction("ASIPDI002PR01", {
      collectionName: "precedent,precedent_gr",
      dcmClCdCtl: ["001_09"],
      schDtBase: "DCM_RGT_DTM",
      sortField: "DCM_RGT_DTM/DESC",
      startCount,
      viewCount: 50,
    });
    const rows =
      arrayValue(objectValue(payload, "ASIPDI002PR01"), "body") ?? [];
    for (const row of rows) {
      const dcm = objectValue(row, "dcm");
      if (
        !dcm ||
        !matchesNtsTaxLawPrecedent(dcm, expectedTitle, expectedCaseNumber)
      ) {
        continue;
      }

      const detailedText = await fetchNtsTaxLawPrecedentDetailText(
        textValue(dcm, "DOC_ID"),
      );
      if (detailedText) {
        return detailedText;
      }

      const text = normalizeWhitespace(textValue(dcm, "FILE_CN"));
      if (
        text &&
        isUsefulOriginalText(text) &&
        !isTruncatedOriginalText(text)
      ) {
        return text;
      }
    }
  }

  return null;
}

async function fetchNtsTaxLawPrecedentDetailText(
  ntstDcmId: string | undefined,
) {
  if (!ntstDcmId) {
    return null;
  }

  const payload = await fetchNtsTaxLawAction("ASIQTB002PR01", {
    dcmDVO: { ntstDcmId },
  });
  const root = objectValue(payload, "ASIQTB002PR01");
  const editorItems = arrayValue(root, "dcmHwpEditorDVOList") ?? [];
  const editorText = editorItems
    .map((item) => htmlToPlainText(textValue(item, "dcmFleByte") ?? null))
    .filter(isUsefulOriginalText)
    .sort((left, right) => right.length - left.length)[0];
  if (editorText && !isTruncatedOriginalText(editorText)) {
    return editorText;
  }

  const dcm = objectValue(root, "dcmDVO");
  const detailText =
    htmlToPlainText(textValue(dcm, "ntstDcmRplyCntn") ?? null) ||
    htmlToPlainText(textValue(dcm, "ntstDcmCntn") ?? null);
  return isUsefulOriginalText(detailText) &&
    !isTruncatedOriginalText(detailText)
    ? detailText
    : null;
}

async function fetchNtsTaxLawAction(actionId: string, paramData: unknown) {
  try {
    const response = await fetch("https://taxlaw.nts.go.kr/action.do", {
      body: new URLSearchParams({
        actionId,
        paramData: JSON.stringify(paramData),
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://taxlaw.nts.go.kr/pd/USEPDI001M.do",
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as unknown;
    return objectValue(payload, "data");
  } catch (_error) {
    return null;
  }
}

function matchesNtsTaxLawPrecedent(
  dcm: Record<string, unknown>,
  expectedTitle: string,
  expectedCaseNumber: string,
) {
  const title = normalizeComparableText(textValue(dcm, "TTL"));
  const caseNumber = normalizeComparableText(
    textValue(dcm, "NTST_DCM_DSCM_CNTN"),
  );
  return Boolean(
    (expectedTitle && title.includes(expectedTitle)) ||
      (expectedCaseNumber && caseNumber.includes(expectedCaseNumber)),
  );
}

async function fetchOpenLawMobilePrecedentText(html: string, baseUrl: string) {
  const precSeq = /id=["']precSeq["']\s+value\s*=\s*["']?([^"'\s/>]+)/i.exec(
    html,
  )?.[1];
  if (!precSeq) {
    return null;
  }

  try {
    const response = await fetch(new URL("/DRF/mobilePrecInfoR.do", baseUrl), {
      body: new URLSearchParams({ precSeq }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return null;
    }
    const normalizedText = htmlToPlainText(await response.text());
    return isUsefulOriginalText(normalizedText) ? normalizedText : null;
  } catch (_error) {
    return null;
  }
}

async function fetchText(url: string | URL) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml,text/plain" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return null;
    }
    return response.text();
  } catch (_error) {
    return null;
  }
}

function parseOpenLawOriginalText(payload: unknown, target: OpenLawTarget) {
  const config = openLawTargetConfigs[target];
  const root = firstObjectValue(payload, config.serviceRootKeys) ?? payload;
  return openLawOriginalText(root, target);
}

function openLawOriginalText(item: unknown, target: OpenLawTarget) {
  const direct = directOriginalText(item, target);
  if (direct) {
    return direct;
  }

  if (target !== "law" && target !== "admrul" && target !== "ordin") {
    return undefined;
  }

  return collectTextValues(item, [
    "조문내용",
    "항내용",
    "호내용",
    "목내용",
    "부칙내용",
    "별표내용",
    "개정문내용",
    "제개정이유내용",
    "행정규칙내용",
    "자치법규내용",
  ]).join("\n\n");
}

function directOriginalText(item: unknown, target: OpenLawTarget) {
  if (target === "detc") {
    return (
      textValue(item, "전문") ??
      textValue(item, "헌재결정례내용") ??
      textValue(item, "결정문") ??
      textValue(item, "내용")
    );
  }
  if (target === "law" || target === "admrul" || target === "ordin") {
    return (
      textValue(item, "법령내용") ??
      textValue(item, "행정규칙내용") ??
      textValue(item, "자치법규내용") ??
      textValue(item, "조문내용") ??
      textValue(item, "내용")
    );
  }
  return textValue(item, "판례내용") ?? textValue(item, "내용");
}

function openLawJsonUrl(
  input: {
    externalId?: string;
    sourceUrl: string | null;
    target: OpenLawTarget;
  },
  oc: string,
) {
  const value =
    input.sourceUrl ?? openLawPublicServiceUrl(input.target, input.externalId);
  if (!value) {
    return null;
  }

  const url = new URL(value);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", input.target);
  url.searchParams.set("type", "JSON");
  if (
    input.target === "law" &&
    !url.searchParams.get("ID") &&
    !url.searchParams.get("MST") &&
    input.externalId
  ) {
    url.searchParams.set("ID", input.externalId);
  } else if (
    input.target !== "law" &&
    !url.searchParams.get("ID") &&
    input.externalId
  ) {
    url.searchParams.set("ID", input.externalId);
  }
  return url;
}

function openLawPublicServiceUrl(
  target: OpenLawTarget,
  externalId: string | undefined,
) {
  if (!externalId) {
    return undefined;
  }

  const url = new URL(OPEN_LAW_SERVICE_API_URL);
  url.searchParams.set("target", target);
  url.searchParams.set("type", "HTML");
  url.searchParams.set("ID", externalId);
  return url.toString();
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

function getOpenLawOc(db: SqliteDatabase) {
  return (
    getSetting(db, "open_law_oc") ??
    getSetting(db, "open_law_api_key") ??
    getSetting(db, "law_open_api_oc")
  );
}

function openLawCacheKey(
  target: OpenLawTarget,
  query: string,
  options: OpenLawSearchOptions,
) {
  const params = new URLSearchParams({
    display: String(options.display ?? 20),
    page: String(options.page ?? 1),
    query: query.trim(),
    target,
    type: "JSON",
  });
  return params.toString();
}

function readCachedOpenLawResponse(
  db: SqliteDatabase,
  provider: string,
  cacheKey: string,
) {
  const row = db
    .prepare<[string, string, string], { response_json: string }>(
      `SELECT response_json
        FROM external_api_cache
        WHERE provider = ? AND cache_key = ? AND expires_at > ?
        LIMIT 1`,
    )
    .get(provider, cacheKey, nowIso());
  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.response_json) as unknown;
  } catch (_error) {
    return null;
  }
}

function targetFromProvider(provider: string): OpenLawTarget | null {
  const entry = openLawCollectionTargets.find(
    (target) => openLawTargetConfigs[target].provider === provider,
  );
  return entry ?? null;
}

function setDefaultSort(url: URL, target: OpenLawTarget) {
  if (target === "prec") {
    url.searchParams.set("sort", "ddes");
  }
  if (target === "detc") {
    url.searchParams.set("sort", "efdes");
  }
  if (target === "law" || target === "admrul" || target === "ordin") {
    url.searchParams.set("sort", "ddes");
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
  const url =
    value.startsWith("http://") || value.startsWith("https://")
      ? new URL(value)
      : new URL(value, "https://www.law.go.kr");
  url.searchParams.delete("OC");
  return url.toString();
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

function collectTextValues(source: unknown, keys: string[]) {
  const values: string[] = [];
  const seen = new Set<string>();

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const text = keys.includes(key)
        ? normalizeWhitespace(scalarText(child))
        : undefined;
      if (text && !seen.has(text)) {
        seen.add(text);
        values.push(text);
      }
      visit(child);
    }
  }

  visit(source);
  return values;
}

function extractHtmlAttribute(html: string, tag: string, attribute: string) {
  const tagPattern = new RegExp(`<${tag}\\b[^>]*>`, "i");
  const tagMatch = tagPattern.exec(html);
  if (!tagMatch) {
    return null;
  }
  const attrPattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i");
  return attrPattern.exec(tagMatch[0])?.[1] ?? null;
}

function htmlToPlainText(value: string | null) {
  if (!value) {
    return "";
  }
  return decodeHtmlEntities(
    value
      .replaceAll(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replaceAll(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replaceAll(/<br\s*\/?>/gi, "\n")
      .replaceAll(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
      .replaceAll(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join("\n");
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    apos: "'",
  };
  return value.replaceAll(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body) => {
    const key = String(body).toLowerCase();
    if (key.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    }
    if (key.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    }
    return named[key] ?? entity;
  });
}

function isUsefulOriginalText(value: string) {
  return value.length >= 200 && !value.includes("오류페이지");
}

function isTruncatedOriginalText(value: string) {
  return /(?:\.{3}|…)\s*$/.test(value.trim());
}

function normalizeWhitespace(value: string | undefined) {
  return value?.replaceAll(/\s+/g, " ").trim() ?? "";
}

function normalizeComparableText(value: string | undefined) {
  return normalizeWhitespace(value)
    .replaceAll(/[()[\]{}【】"'`.,·\s-]/g, "")
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function scalarText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

function textValue(source: unknown, key: string) {
  if (!isRecord(source)) {
    return undefined;
  }
  return normalizeWhitespace(scalarText(source[key])) || undefined;
}

function objectValue(source: unknown, key: string) {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  return isRecord(value) ? value : undefined;
}

function firstObjectValue(source: unknown, keys: readonly string[]) {
  for (const key of keys) {
    const value = objectValue(source, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function findOpenLawRoot(
  payload: unknown,
  rootKeys: readonly string[],
  itemKeys: readonly string[],
) {
  const configuredRoot = firstObjectValue(payload, rootKeys);
  if (configuredRoot) {
    return configuredRoot;
  }
  if (!isRecord(payload)) {
    return payload;
  }
  for (const value of Object.values(payload)) {
    if (
      isRecord(value) &&
      itemKeys.some((itemKey) => arrayValue(value, itemKey))
    ) {
      return value;
    }
  }
  return payload;
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
