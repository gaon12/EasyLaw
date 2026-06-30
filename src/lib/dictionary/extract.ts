import type { DictionaryTerm } from "./types";

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
    const word = wordField(record) ?? inheritedWord;
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

export function dedupeTerms(terms: readonly DictionaryTerm[]) {
  const seen = new Set<string>();
  const result: DictionaryTerm[] = [];
  for (const term of terms) {
    const key = `${term.source ?? ""}\n${term.word}\n${term.senseNo}\n${term.definition}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(term);
  }
  return result;
}

function wordField(record: Record<string, unknown>) {
  const word = stringField(record, ["word", "target_code", "표제어"]);
  if (word) {
    return word;
  }
  const lexicalUnit = record.lexicalUnit ?? record.lexical_unit;
  if (typeof lexicalUnit === "string") {
    return lexicalUnit;
  }
  return null;
}

function stringField(record: Record<string, unknown>, keys: readonly string[]) {
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
