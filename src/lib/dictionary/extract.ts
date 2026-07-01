import type { DictionaryTerm } from "./types";

export function extractDictionaryTerms(value: unknown): DictionaryTerm[] {
  const result: DictionaryTerm[] = [];
  visit(value, {});
  return dedupeTerms(result);

  function visit(node: unknown, context: ExtractionContext) {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, context);
      }
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }

    const record = node as Record<string, unknown>;
    const nextContext = {
      origin: originField(record) ?? context.origin,
      partOfSpeech: partOfSpeechField(record) ?? context.partOfSpeech,
      word: wordField(record) ?? context.word,
    };
    const definition =
      stringField(record, ["definition", "sense_def", "def", "뜻풀이"]) ??
      featureValue(record, ["definition"]);
    if (nextContext.word && definition) {
      result.push({
        definition,
        origin: nextContext.origin ?? null,
        partOfSpeech: nextContext.partOfSpeech ?? null,
        senseNo: senseNoField(record) ?? "",
        word: normalizeWord(nextContext.word),
      });
    }

    for (const [key, child] of Object.entries(record)) {
      if (skipDictionaryChild(key)) {
        continue;
      }
      visit(child, nextContext);
    }
  }
}

type ExtractionContext = {
  origin?: string | null;
  partOfSpeech?: string | null;
  word?: string | null;
};

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
  const word = stringField(record, ["word", "표제어"]);
  if (word) {
    return word;
  }
  const lemma =
    typeof record.Lemma === "object" && record.Lemma !== null
      ? (record.Lemma as Record<string, unknown>)
      : null;
  const lemmaWord = lemma
    ? objectFeatureValue(lemma.feat, ["writtenForm", "lemma"])
    : null;
  if (lemmaWord) {
    return lemmaWord;
  }
  const writtenForm = featureValue(record, ["writtenForm", "lemma"]);
  if (writtenForm) {
    return writtenForm;
  }
  const lexicalUnit = record.lexicalUnit ?? record.lexical_unit;
  if (typeof lexicalUnit === "string") {
    return lexicalUnit;
  }
  return null;
}

function partOfSpeechField(record: Record<string, unknown>) {
  return (
    stringField(record, ["pos", "part_of_speech", "품사"]) ??
    featureValue(record, ["partOfSpeech", "pos", "품사"])
  );
}

function originField(record: Record<string, unknown>) {
  const origin =
    stringField(record, ["origin", "original_language", "원어"]) ??
    featureValue(record, ["origin", "original_language", "원어"]);
  if (origin) {
    return origin;
  }

  const originalLanguageInfo = record.original_language_info;
  if (!Array.isArray(originalLanguageInfo)) {
    return null;
  }
  const values = originalLanguageInfo
    .map((item) =>
      typeof item === "object" && item !== null
        ? stringField(item as Record<string, unknown>, ["original_language"])
        : null,
    )
    .filter((item): item is string => Boolean(item));
  return values.length > 0 ? values.join(" ") : null;
}

function senseNoField(record: Record<string, unknown>) {
  const direct = stringField(record, [
    "sense_no",
    "senseNo",
    "뜻풀이번호",
    "sense_code",
  ]);
  if (direct) {
    return direct;
  }
  const att = record.att;
  const value = record.val;
  if (
    att === "id" &&
    (typeof value === "string" || typeof value === "number")
  ) {
    return String(value);
  }
  return featureValue(record, ["sense_no", "senseNo", "뜻풀이번호"]);
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
    .replace(/(?<=[가-힣])\d{2}$/g, "")
    .replace(/[-‐‑‒–—]/g, "")
    .trim();
}

function featureValue(
  record: Record<string, unknown>,
  keys: readonly string[],
) {
  return objectFeatureValue(record.feat, keys);
}

function objectFeatureValue(value: unknown, keys: readonly string[]) {
  const features = Array.isArray(value) ? value : value ? [value] : [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") {
      continue;
    }
    const record = feature as Record<string, unknown>;
    if (typeof record.att !== "string" || !keys.includes(record.att)) {
      continue;
    }
    if (typeof record.val === "string" && record.val.trim()) {
      return record.val.trim();
    }
    if (typeof record.val === "number") {
      return String(record.val);
    }
  }
  return null;
}

function skipDictionaryChild(key: string) {
  return key === "Equivalent" || key === "SenseExample";
}
