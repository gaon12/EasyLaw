import type { SqliteDatabase } from "../db";
import { logIntegrationEvent } from "../integration-events";
import { getSetting } from "../settings";
import {
  completeDictionaryImport,
  failDictionaryImport,
  startDictionaryImport,
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

const OPEN_LAW_LEGAL_TERM_API_URL = "https://www.law.go.kr/DRF/lawSearch.do";
const LEGAL_TERM_PAGE_SIZE = 100;
const MAX_LEGAL_TERM_PAGES = 1000;

export async function updateOpenLawLegalDictionary(db: SqliteDatabase) {
  const oc = getOpenLawOc(db);
  const sourceUrl = `${OPEN_LAW_LEGAL_TERM_API_URL}?target=lstrmAI`;
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
    const terms = await fetchOpenLawLegalTerms(oc);
    const importedCount = upsertDictionaryTerms(db, {
      source: "legal",
      terms,
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

async function fetchOpenLawLegalTerms(oc: string) {
  const terms: DictionaryTerm[] = [];
  let page = 1;
  let totalCount: number | null = null;

  while (page <= MAX_LEGAL_TERM_PAGES) {
    const payload = await fetchOpenLawLegalTermPage(oc, page);
    const root = findLegalTermRoot(payload);
    const pageTerms = legalTermItems(root).flatMap(parseLegalTermItem);
    terms.push(...pageTerms);
    totalCount ??= parseTotalCount(root);

    if (pageTerms.length === 0) {
      break;
    }
    if (totalCount && page * LEGAL_TERM_PAGE_SIZE >= totalCount) {
      break;
    }
    page += 1;
  }

  return terms;
}

async function fetchOpenLawLegalTermPage(oc: string, page: number) {
  const url = new URL(OPEN_LAW_LEGAL_TERM_API_URL);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "lstrmAI");
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", String(LEGAL_TERM_PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
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

function findLegalTermRoot(payload: unknown) {
  return (
    objectValue(payload, "LstrmAISearch") ??
    objectValue(payload, "lstrmAISearch") ??
    objectValue(payload, "LsTrmSearch") ??
    objectValue(payload, "LstrmSearch") ??
    payload
  );
}

function legalTermItems(root: unknown) {
  return [
    ...(arrayValue(root, "lstrmAI") ?? []),
    ...(arrayValue(root, "LstrmAI") ?? []),
    ...(arrayValue(root, "lstrm") ?? []),
    ...(arrayValue(root, "LsTrm") ?? []),
    ...(arrayValue(root, "item") ?? []),
  ];
}

function parseLegalTermItem(item: unknown): DictionaryTerm[] {
  if (!isRecord(item)) {
    return [];
  }

  const word =
    textValue(item, "법령용어명") ??
    textValue(item, "용어명") ??
    textValue(item, "term") ??
    textValue(item, "word");
  const definition =
    textValue(item, "정의") ??
    textValue(item, "정의문") ??
    textValue(item, "뜻풀이") ??
    textValue(item, "설명") ??
    textValue(item, "용어설명") ??
    textValue(item, "법령용어설명") ??
    textValue(item, "비고");

  if (!word || !definition) {
    return [];
  }

  return [
    {
      definition,
      origin:
        textValue(item, "출처법령") ?? textValue(item, "관련법령") ?? null,
      partOfSpeech: textValue(item, "품사") ?? null,
      senseNo:
        textValue(item, "법령용어ID") ??
        textValue(item, "id") ??
        normalizeSenseNo(word),
      word,
    },
  ];
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
