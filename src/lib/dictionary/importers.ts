import { createHash } from "node:crypto";
import type { SqliteDatabase } from "../db";
import { logIntegrationEvent } from "../integration-events";
import { processJsonZipEntries } from "./download";
import { extractDictionaryTerms } from "./extract";
import {
  completeDictionaryImport,
  failDictionaryImport,
  startDictionaryImport,
  upsertDictionaryTerms,
} from "./repository";
import type { DictionarySource, DictionaryTerm } from "./types";

const standardDownloadUrl = "https://stdict.korean.go.kr/common/download.do";
const basicDownloadUrl = "https://krdict.korean.go.kr/dicBatchDownload?seq=208";
const importBatchSize = 5_000;

export async function updateDictionarySource(
  db: SqliteDatabase,
  source: Exclude<DictionarySource, "legal">,
) {
  const sourceUrl = source === "basic" ? basicDownloadUrl : standardDownloadUrl;
  const importId = startDictionaryImport(db, { source, sourceUrl });
  logIntegrationEvent(db, {
    action: `${source}.download`,
    message: "사전 데이터를 가져오기 시작했습니다.",
    metadata: { importId, source },
    service: "dictionary",
    status: "success",
  });
  try {
    const importedCount = await importDictionaryZip(db, source);
    completeDictionaryImport(db, { importId, importedCount });
    logIntegrationEvent(db, {
      action: `${source}.import`,
      message:
        importedCount > 0
          ? `${importedCount.toLocaleString("ko-KR")}개 뜻풀이를 반영했습니다.`
          : "가져오기는 완료됐지만 새로 반영된 뜻풀이가 없습니다.",
      metadata: { importId, importedCount, source },
      service: "dictionary",
      status: importedCount > 0 ? "success" : "skipped",
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

async function importDictionaryZip(
  db: SqliteDatabase,
  source: Exclude<DictionarySource, "legal">,
) {
  let importedCount = 0;
  const pendingTerms: DictionaryTerm[] = [];
  const dedupe = createImportDedupe(db);

  const flush = () => {
    if (pendingTerms.length === 0) {
      return;
    }
    importedCount += upsertDictionaryTerms(db, {
      source,
      terms: pendingTerms.splice(0, pendingTerms.length),
    });
  };

  try {
    await processJsonZipEntries(requestForSource(source), (entry) => {
      for (const term of extractDictionaryTerms(entry)) {
        if (!dedupe.remember(source, term)) {
          continue;
        }
        pendingTerms.push(term);
        if (pendingTerms.length >= importBatchSize) {
          flush();
        }
      }
    });
    flush();
  } finally {
    dedupe.dispose();
  }

  return importedCount;
}

function createImportDedupe(db: SqliteDatabase) {
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS dictionary_import_seen_terms (
      key_hash TEXT PRIMARY KEY
    );
    DELETE FROM dictionary_import_seen_terms;
  `);
  const remember = db.prepare<[string]>(
    `INSERT OR IGNORE INTO dictionary_import_seen_terms (key_hash)
      VALUES (?)`,
  );

  return {
    dispose() {
      db.exec("DELETE FROM dictionary_import_seen_terms;");
    },
    remember(source: DictionarySource, term: DictionaryTerm) {
      const result = remember.run(dictionaryTermKeyHash(source, term));
      return result.changes > 0;
    },
  };
}

function dictionaryTermKeyHash(source: DictionarySource, term: DictionaryTerm) {
  return createHash("sha256")
    .update(source)
    .update("\0")
    .update(term.word)
    .update("\0")
    .update(term.senseNo)
    .update("\0")
    .update(term.definition)
    .digest("hex");
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
    url: standardDownloadUrl,
  };
}
