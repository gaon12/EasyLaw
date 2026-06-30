import type { SqliteDatabase } from "../db";
import { upsertDictionaryTerms } from "./repository";

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
