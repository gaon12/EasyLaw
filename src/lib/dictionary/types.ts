export const dictionarySources = ["legal", "basic", "standard"] as const;

export type DictionarySource = (typeof dictionarySources)[number];

export type DictionaryTerm = {
  definition: string;
  origin: string | null;
  partOfSpeech: string | null;
  senseNo: string;
  source?: DictionarySource;
  word: string;
};

export const sourcePriority = {
  legal: 1,
  basic: 2,
  standard: 3,
} satisfies Record<DictionarySource, number>;

export function isDictionarySource(value: string): value is DictionarySource {
  return dictionarySources.some((source) => source === value);
}
