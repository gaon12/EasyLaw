import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import type { SqliteDatabase } from "./db";
import { newId } from "./security/crypto";
import { getSetting } from "./settings";
import { nowIso } from "./time";

export type DictionaryTerm = {
  definition: string;
  origin: string | null;
  partOfSpeech: string | null;
  senseNo: string;
  word: string;
};

const downloadUrl = "https://stdict.korean.go.kr/common/download.do";

export async function updateStandardDictionary(db: SqliteDatabase) {
  const importId = newId("dictimport");
  const now = nowIso();
  db.prepare(
    `INSERT INTO dictionary_imports
      (id, status, source_url, created_at)
      VALUES (?, 'running', ?, ?)`,
  ).run(importId, downloadUrl, now);

  const tempDir = await mkdtemp(path.join(tmpdir(), "easylaw-stdict-"));
  const zipPath = path.join(tempDir, "stdict.zip");
  try {
    const body = new URLSearchParams({
      link_key: "1563764",
      pageIndex: "1",
      pageUnit: "10",
    });
    const response = await fetch(downloadUrl, {
      body,
      method: "POST",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`표준국어대사전 다운로드 실패: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(zipPath, buffer);
    const zip = unzipSync(new Uint8Array(await readFile(zipPath)));
    const terms: DictionaryTerm[] = [];

    for (const [filename, content] of Object.entries(zip)) {
      if (!filename.toLowerCase().endsWith(".json")) {
        continue;
      }
      const json = JSON.parse(Buffer.from(content).toString("utf8")) as unknown;
      terms.push(...extractDictionaryTerms(json));
    }

    const importedCount = upsertDictionaryTerms(db, terms);
    db.prepare(
      `UPDATE dictionary_imports
        SET status = 'completed',
            imported_count = ?,
            completed_at = ?
        WHERE id = ?`,
    ).run(importedCount, nowIso(), importId);

    return { importId, importedCount, ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    db.prepare(
      `UPDATE dictionary_imports
        SET status = 'failed',
            failure_reason = ?,
            completed_at = ?
        WHERE id = ?`,
    ).run(message, nowIso(), importId);
    return { importId, message, ok: false as const };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

export function findDictionaryTerms(db: SqliteDatabase, word: string) {
  return db
    .prepare<
      [string],
      {
        definition: string;
        origin: string | null;
        part_of_speech: string | null;
        sense_no: string;
        word: string;
      }
    >(
      `SELECT word, sense_no, part_of_speech, definition, origin
        FROM dictionary_terms
        WHERE word = ?
        ORDER BY CAST(NULLIF(sense_no, '') AS INTEGER), definition
        LIMIT 5`,
    )
    .all(word.trim())
    .map((row) => ({
      definition: row.definition,
      origin: row.origin,
      partOfSpeech: row.part_of_speech,
      senseNo: row.sense_no,
      word: row.word,
    }));
}

export function latestDictionaryImport(db: SqliteDatabase) {
  return db
    .prepare<
      [],
      {
        completed_at: string | null;
        failure_reason: string | null;
        imported_count: number;
        status: string;
      }
    >(
      `SELECT status, imported_count, failure_reason, completed_at
        FROM dictionary_imports
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get();
}

export function buildTermExplanation(db: SqliteDatabase, term: string) {
  const cleanTerm = term.trim().replace(/\s+/g, " ").slice(0, 40);
  const definitions = findDictionaryTerms(db, cleanTerm);
  const mcpEndpoint = getSetting(db, "mcp_korean_law_endpoint");
  const plain =
    definitions[0]?.definition ??
    "아직 로컬 사전에서 찾지 못했어요. 관리자센터에서 표준국어대사전 데이터를 업데이트해 주세요.";

  return {
    aiAvailable: Boolean(mcpEndpoint),
    aiExplanation: definitions[0]
      ? `${cleanTerm}은(는) 여기서는 “${definitions[0].definition}” 정도로 이해하면 좋아요. 문맥에 따라 법률상 의미가 달라질 수 있어 판결문 문장 전체와 함께 확인해 주세요.`
      : "MCP/AI 설명은 사전 데이터나 MCP 연결이 준비되면 더 정확하게 제공할 수 있어요.",
    definitions,
    plain,
    term: cleanTerm,
  };
}

export function extractDictionaryTerms(value: unknown): DictionaryTerm[] {
  const result: DictionaryTerm[] = [];
  visit(value, null);
  return dedupeTerms(result);

  function visit(node: unknown, inheritedWord: string | null) {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, inheritedWord);
      }
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }

    const record = node as Record<string, unknown>;
    const word =
      stringField(record, ["word", "target_code", "표제어"]) ?? inheritedWord;
    const definition = stringField(record, [
      "definition",
      "sense_def",
      "def",
      "뜻풀이",
    ]);
    if (word && definition) {
      result.push({
        definition,
        origin: stringField(record, ["origin", "original_language", "원어"]),
        partOfSpeech: stringField(record, ["pos", "part_of_speech", "품사"]),
        senseNo:
          stringField(record, ["sense_no", "senseNo", "뜻풀이번호"]) ?? "",
        word: normalizeWord(word),
      });
    }

    for (const child of Object.values(record)) {
      visit(child, word);
    }
  }
}

function upsertDictionaryTerms(db: SqliteDatabase, terms: DictionaryTerm[]) {
  const uniqueTerms = dedupeTerms(terms);
  const insert = db.prepare(
    `INSERT INTO dictionary_terms
      (id, word, sense_no, part_of_speech, definition, origin, raw_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(word, sense_no, definition)
      DO UPDATE SET
        part_of_speech = excluded.part_of_speech,
        origin = excluded.origin,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at`,
  );
  const tx = db.transaction(() => {
    for (const term of uniqueTerms) {
      insert.run(
        newId("dict"),
        term.word,
        term.senseNo,
        term.partOfSpeech,
        term.definition,
        term.origin,
        JSON.stringify(term),
        nowIso(),
      );
    }
  });
  tx();
  return uniqueTerms.length;
}

function stringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

function normalizeWord(word: string) {
  return word
    .replace(/\^/g, " ")
    .replace(/[-‐‑‒–—]$/g, "")
    .trim();
}

function dedupeTerms(terms: DictionaryTerm[]) {
  const seen = new Set<string>();
  const result: DictionaryTerm[] = [];
  for (const term of terms) {
    const key = `${term.word}\n${term.senseNo}\n${term.definition}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(term);
  }
  return result;
}
