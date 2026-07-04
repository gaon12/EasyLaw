import type { SqliteDatabase } from "../db";
import { logIntegrationEvent } from "../integration-events";
import { getSetting } from "../settings";
import {
  completeDictionaryImport,
  failDictionaryImport,
  startDictionaryImport,
  updateDictionaryImportProgress,
  upsertDictionaryTerms,
} from "./repository";
import type { DictionaryTerm } from "./types";

export function addLegalDictionaryTerm(
  db: SqliteDatabase,
  input: {
    definition: string;
    origin?: string | null;
    partOfSpeech?: string | null;
    word: string;
  },
) {
  return upsertDictionaryTerms(db, {
    source: "legal",
    terms: [
      {
        definition: input.definition.trim(),
        origin: input.origin?.trim() || null,
        partOfSpeech: input.partOfSpeech?.trim() || null,
        senseNo: "legal",
        word: input.word.trim(),
      },
    ],
  });
}

const OPEN_LAW_LEGAL_TERM_SEARCH_API_URL =
  "https://www.law.go.kr/DRF/lawSearch.do";
const OPEN_LAW_LEGAL_TERM_SERVICE_API_URL =
  "https://www.law.go.kr/DRF/lawService.do";
const LEGAL_TERM_PAGE_SIZE = 100;
const MAX_LEGAL_TERM_PAGES = 1000;
const LEGAL_TERM_DETAIL_BATCH_SIZE = 20;
const LEGAL_TERM_PAGE_CONCURRENCY = 2;
const LEGAL_TERM_DETAIL_CONCURRENCY = 4;
const OPEN_LAW_LEGAL_TERM_TIMEOUT_MS = 15_000;

type LegalTermReference = {
  id: string | null;
  word: string;
};

type LegalTermListPage = {
  references: LegalTermReference[];
  totalCount: number | null;
};

type LegalTermPage = {
  references: LegalTermReference[];
  terms: DictionaryTerm[];
  totalCount: number | null;
};

export async function updateOpenLawLegalDictionary(db: SqliteDatabase) {
  const oc = getOpenLawOc(db);
  const sourceUrl = `${OPEN_LAW_LEGAL_TERM_SEARCH_API_URL}?target=lstrm`;
  const importId = startDictionaryImport(db, {
    source: "legal",
    sourceUrl,
  });

  if (!oc) {
    const message =
      "open.law.go.kr OC 키가 없어 법령용어 사전을 가져오지 못했습니다.";
    failDictionaryImport(db, { importId, message });
    logIntegrationEvent(db, {
      action: "legal.open-law.import",
      message,
      metadata: { importId },
      service: "dictionary",
      status: "failed",
    });
    return { importId, message, ok: false as const, source: "legal" as const };
  }

  logIntegrationEvent(db, {
    action: "legal.open-law.download",
    message: "법령용어 사전을 가져오기 시작했습니다.",
    metadata: { importId },
    service: "dictionary",
    status: "success",
  });

  try {
    const importedCount = await importOpenLawLegalTerms(db, oc, (progress) => {
      updateDictionaryImportProgress(db, importId, progress);
    });
    updateDictionaryImportProgress(db, importId, {
      current: importedCount,
      importedCount,
      message: "법령용어 업데이트 결과를 정리하고 있어요.",
      stage: "finalizing",
      total: Math.max(1, importedCount),
    });
    completeDictionaryImport(db, { importId, importedCount });
    logIntegrationEvent(db, {
      action: "legal.open-law.import",
      message:
        importedCount > 0
          ? `${importedCount.toLocaleString("ko-KR")}개 법령용어를 반영했습니다.`
          : "가져오기는 완료됐지만 새로 반영된 법령용어가 없습니다.",
      metadata: { importId, importedCount },
      service: "dictionary",
      status: importedCount > 0 ? "success" : "skipped",
    });
    return {
      importId,
      importedCount,
      ok: true as const,
      source: "legal" as const,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "법령용어 사전 가져오기 실패";
    failDictionaryImport(db, { importId, message });
    logIntegrationEvent(db, {
      action: "legal.open-law.import",
      message,
      metadata: { importId },
      service: "dictionary",
      status: "failed",
    });
    return { importId, message, ok: false as const, source: "legal" as const };
  }
}

async function importOpenLawLegalTerms(
  db: SqliteDatabase,
  oc: string,
  onProgress: (progress: {
    current: number;
    importedCount?: number;
    message: string;
    stage: "downloading" | "saving" | "scanning";
    total: number;
  }) => void,
) {
  let importedCount = 0;

  onProgress({
    current: 0,
    message: "1쪽 법령용어를 가져오고 있어요.",
    stage: "downloading",
    total: 1,
  });
  const firstPayload = await fetchOpenLawLegalTermPage(oc, 1);
  const firstListPage = parseLegalTermListPage(firstPayload);
  const totalPages = firstListPage.totalCount
    ? Math.min(pageTotal(firstListPage.totalCount), MAX_LEGAL_TERM_PAGES)
    : null;

  if (!totalPages) {
    return importLegalTermPagesSequentially({
      db,
      firstListPage,
      importedCount,
      oc,
      onProgress,
    });
  }

  let completedPages = 0;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  await mapWithConcurrency(pages, LEGAL_TERM_PAGE_CONCURRENCY, async (page) => {
    onProgress({
      current: completedPages,
      importedCount,
      message: `${page.toLocaleString("ko-KR")}쪽 법령용어를 가져오고 있어요.`,
      stage: "downloading",
      total: totalPages,
    });
    const pageData =
      page === 1
        ? await hydrateLegalTermPage(oc, firstListPage)
        : await fetchLegalTermPage(oc, page);
    importedCount += upsertDictionaryTerms(db, {
      source: "legal",
      terms: pageData.terms,
    });
    completedPages += 1;
    onProgress({
      current: completedPages,
      importedCount,
      message: `${importedCount.toLocaleString("ko-KR")}개 법령용어 정의를 저장했어요.`,
      stage: "saving",
      total: totalPages,
    });
  });

  return importedCount;
}

function pageTotal(totalCount: number) {
  return Math.max(1, Math.ceil(totalCount / LEGAL_TERM_PAGE_SIZE));
}

async function importLegalTermPagesSequentially(input: {
  db: SqliteDatabase;
  firstListPage: LegalTermListPage;
  importedCount: number;
  oc: string;
  onProgress: (progress: {
    current: number;
    importedCount?: number;
    message: string;
    stage: "downloading" | "saving" | "scanning";
    total: number;
  }) => void;
}) {
  let importedCount = input.importedCount;
  let page = 1;
  let pageData = await hydrateLegalTermPage(input.oc, input.firstListPage);

  while (page <= MAX_LEGAL_TERM_PAGES) {
    importedCount += upsertDictionaryTerms(input.db, {
      source: "legal",
      terms: pageData.terms,
    });
    input.onProgress({
      current: page,
      importedCount,
      message: `${importedCount.toLocaleString("ko-KR")}개 법령용어 정의를 저장했어요.`,
      stage: "saving",
      total: page,
    });

    if (pageData.references.length === 0) {
      break;
    }
    page += 1;
    input.onProgress({
      current: page - 1,
      importedCount,
      message: `${page.toLocaleString("ko-KR")}쪽 법령용어를 가져오고 있어요.`,
      stage: "downloading",
      total: page,
    });
    pageData = await fetchLegalTermPage(input.oc, page);
  }

  return importedCount;
}

function parseLegalTermListPage(payload: unknown): LegalTermListPage {
  const root = findLegalTermRoot(payload);
  const references = legalTermItems(root).flatMap(parseLegalTermReference);
  return {
    references,
    totalCount: parseTotalCount(root),
  };
}

async function fetchLegalTermPage(
  oc: string,
  page: number,
): Promise<LegalTermPage> {
  return hydrateLegalTermPage(
    oc,
    parseLegalTermListPage(await fetchOpenLawLegalTermPage(oc, page)),
  );
}

async function hydrateLegalTermPage(
  oc: string,
  page: LegalTermListPage,
): Promise<LegalTermPage> {
  const terms =
    page.references.length > 0
      ? await fetchOpenLawLegalTermsInBatches(oc, page.references)
      : [];
  return {
    references: page.references,
    terms,
    totalCount: page.totalCount,
  };
}

async function fetchOpenLawLegalTermPage(oc: string, page: number) {
  const url = new URL(OPEN_LAW_LEGAL_TERM_SEARCH_API_URL);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "lstrm");
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", String(LEGAL_TERM_PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(OPEN_LAW_LEGAL_TERM_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`법령용어 API가 ${response.status} 상태를 반환했습니다.`);
  }

  const payload = (await response.json()) as unknown;
  if (isRecord(payload) && typeof payload.result === "string") {
    throw new Error(payload.msg?.toString() || payload.result);
  }
  return payload;
}

async function fetchOpenLawLegalTermsInBatches(
  oc: string,
  references: readonly LegalTermReference[],
) {
  const batches = chunkReferences(references, LEGAL_TERM_DETAIL_BATCH_SIZE);
  const terms = await mapWithConcurrency(
    batches,
    LEGAL_TERM_DETAIL_CONCURRENCY,
    async (batch) =>
      parseLegalTermDetailPayload(
        await fetchOpenLawLegalTermDetails(oc, batch),
        batch,
      ),
  );
  return terms.flat();
}

async function fetchOpenLawLegalTermDetails(
  oc: string,
  references: readonly LegalTermReference[],
) {
  const ids = references
    .map((reference) => reference.id)
    .filter((id): id is string => Boolean(id));
  const url = new URL(OPEN_LAW_LEGAL_TERM_SERVICE_API_URL);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "lstrm");
  url.searchParams.set("type", "JSON");
  if (ids.length > 0) {
    url.searchParams.set("trmSeqs", ids.join(","));
  } else {
    url.searchParams.set("query", references[0]?.word ?? "");
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(OPEN_LAW_LEGAL_TERM_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `법령용어 본문 API가 ${response.status} 상태를 반환했습니다.`,
    );
  }

  const payload = (await response.json()) as unknown;
  if (isRecord(payload) && typeof payload.result === "string") {
    throw new Error(payload.msg?.toString() || payload.result);
  }
  return payload;
}

function chunkReferences(
  references: readonly LegalTermReference[],
  size: number,
) {
  const chunks: LegalTermReference[][] = [];
  for (let index = 0; index < references.length; index += size) {
    chunks.push(references.slice(index, index + size));
  }
  return chunks;
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

function findLegalTermRoot(payload: unknown) {
  return (
    objectValue(payload, "LstrmAISearch") ??
    objectValue(payload, "lstrmAISearch") ??
    objectValue(payload, "LsTrmSearch") ??
    objectValue(payload, "LstrmSearch") ??
    objectValue(payload, "lstrmSearch") ??
    payload
  );
}

function legalTermItems(root: unknown) {
  return [
    ...(arrayValue(root, "법령용어") ?? []),
    ...(arrayValue(root, "lstrmAI") ?? []),
    ...(arrayValue(root, "LstrmAI") ?? []),
    ...(arrayValue(root, "lstrm") ?? []),
    ...(arrayValue(root, "LsTrm") ?? []),
    ...(arrayValue(root, "item") ?? []),
  ];
}

function parseLegalTermReference(item: unknown): LegalTermReference[] {
  if (!isRecord(item)) {
    return [];
  }

  const word =
    textValue(item, "법령용어명") ??
    textValue(item, "법령용어명_한글") ??
    textValue(item, "용어명") ??
    textValue(item, "term") ??
    textValue(item, "word");

  if (!word) {
    return [];
  }

  return [
    {
      id:
        textValue(item, "법령용어ID") ??
        textValue(item, "법령용어일련번호") ??
        textValue(item, "id") ??
        null,
      word,
    },
  ];
}

function parseLegalTermDetailPayload(
  payload: unknown,
  references: readonly LegalTermReference[],
): DictionaryTerm[] {
  const root =
    objectValue(payload, "LsTrmService") ??
    objectValue(payload, "lsTrmService") ??
    payload;
  if (!isRecord(root)) {
    return [];
  }

  const rows = legalTermDetailRowCount(root);
  const terms: DictionaryTerm[] = [];
  const referencesById = new Map(
    references
      .filter((reference) => reference.id)
      .map((reference) => [reference.id, reference]),
  );

  for (let index = 0; index < rows; index += 1) {
    const senseNo =
      indexedTextValue(root, "법령용어일련번호", index) ??
      indexedTextValue(root, "법령용어ID", index);
    const fallbackReference =
      (senseNo ? referencesById.get(senseNo) : undefined) ?? references[index];
    const word =
      indexedTextValue(root, "법령용어명_한글", index) ??
      indexedTextValue(root, "법령용어명", index) ??
      fallbackReference?.word;
    const definition = decodeHtmlEntities(
      indexedTextValue(root, "법령용어정의", index) ??
        indexedTextValue(root, "정의", index) ??
        "",
    );

    if (!word || !definition) {
      continue;
    }

    terms.push({
      definition,
      origin: indexedTextValue(root, "출처", index) ?? null,
      partOfSpeech: indexedTextValue(root, "법령용어코드명", index) ?? null,
      senseNo:
        senseNo ??
        indexedTextValue(root, "법령용어코드", index) ??
        fallbackReference?.id ??
        normalizeSenseNo(`${word}-${index + 1}`),
      word,
    });
  }

  return terms;
}

function legalTermDetailRowCount(root: Record<string, unknown>) {
  const fields = [
    "법령용어일련번호",
    "법령용어명_한글",
    "법령용어정의",
    "법령용어코드명",
    "출처",
  ];
  const arrayLengths = fields
    .map((field) => root[field])
    .filter(Array.isArray)
    .map((value) => value.length);
  if (arrayLengths.length > 0) {
    return Math.max(...arrayLengths);
  }
  return fields.some((field) => root[field] !== undefined) ? 1 : 0;
}

function parseTotalCount(root: unknown) {
  const total =
    textValue(root, "totalCnt") ??
    textValue(root, "검색결과개수") ??
    textValue(root, "totalCount");
  if (!total) {
    return null;
  }
  const count = Number.parseInt(total, 10);
  return Number.isFinite(count) ? count : null;
}

function getOpenLawOc(db: SqliteDatabase) {
  return (
    getSetting(db, "open_law_oc") ??
    getSetting(db, "open_law_api_key") ??
    getSetting(db, "law_open_api_oc")
  );
}

function normalizeSenseNo(value: string) {
  return value.replaceAll(/\s+/g, "-").slice(0, 80);
}

function normalizeWhitespace(value: string | undefined) {
  return value?.replaceAll(/\s+/g, " ").trim() ?? "";
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .trim();
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

function indexedTextValue(source: unknown, key: string, index: number) {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  let text: string | undefined;
  if (Array.isArray(value)) {
    text = scalarText(value[index]);
  } else if (index === 0) {
    text = scalarText(value);
  } else {
    return undefined;
  }
  return decodeHtmlEntities(normalizeWhitespace(text)) || undefined;
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
