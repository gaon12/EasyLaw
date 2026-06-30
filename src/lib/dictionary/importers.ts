import type { SqliteDatabase } from "../db";
import { logIntegrationEvent } from "../integration-events";
import { downloadJsonZip } from "./download";
import { extractDictionaryTerms } from "./extract";
import {
  completeDictionaryImport,
  failDictionaryImport,
  startDictionaryImport,
  upsertDictionaryTerms,
} from "./repository";
import type { DictionarySource } from "./types";

const standardDownloadUrl = "https://stdict.korean.go.kr/common/download.do";
const basicDownloadUrl = "https://krdict.korean.go.kr/dicBatchDownload?seq=208";

export async function updateDictionarySource(
  db: SqliteDatabase,
  source: Exclude<DictionarySource, "legal">,
) {
  const sourceUrl = source === "basic" ? basicDownloadUrl : standardDownloadUrl;
  const importId = startDictionaryImport(db, { source, sourceUrl });
  logIntegrationEvent(db, {
    action: `${source}.download`,
    message: "사전 데이터 다운로드를 시작했습니다.",
    metadata: { importId, source },
    service: "dictionary",
    status: "success",
  });
  try {
    const jsonEntries = await downloadJsonZip(requestForSource(source));
    const terms = jsonEntries.flatMap((entry) => extractDictionaryTerms(entry));
    const importedCount = upsertDictionaryTerms(db, { source, terms });
    completeDictionaryImport(db, { importId, importedCount });
    logIntegrationEvent(db, {
      action: `${source}.import`,
      message: `${importedCount.toLocaleString("ko-KR")}개 뜻풀이를 반영했습니다.`,
      metadata: { importId, importedCount, source },
      service: "dictionary",
      status: "success",
    });
    return { importId, importedCount, ok: true as const, source };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    failDictionaryImport(db, { importId, message });
    logIntegrationEvent(db, {
      action: `${source}.import`,
      message,
      metadata: { importId, source },
      service: "dictionary",
      status: "failed",
    });
    return { importId, message, ok: false as const, source };
  }
}

export async function updateDownloadableDictionaries(db: SqliteDatabase) {
  const basic = await updateDictionarySource(db, "basic");
  const standard = await updateDictionarySource(db, "standard");
  return {
    importedCount:
      (basic.ok ? basic.importedCount : 0) +
      (standard.ok ? standard.importedCount : 0),
    ok: basic.ok && standard.ok,
    results: [basic, standard],
  };
}

function requestForSource(source: Exclude<DictionarySource, "legal">) {
  if (source === "basic") {
    return {
      method: "GET" as const,
      tempPrefix: "easylaw-krdict-",
      url: basicDownloadUrl,
    };
  }

  return {
    body: new URLSearchParams({
      link_key: "1563764",
      pageIndex: "1",
      pageUnit: "10",
    }),
    method: "POST" as const,
    tempPrefix: "easylaw-stdict-",
    url: standardDownloadUrl,
  };
}
