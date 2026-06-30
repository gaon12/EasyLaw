export const JUDGMENT_SEARCH_QUERY_MAX_LENGTH = 100;
export const LEGAL_RESEARCH_QUERY_MAX_LENGTH = 1200;
export const CUSTOM_JUDGMENT_TITLE_MAX_LENGTH = 120;
export const CUSTOM_JUDGMENT_TEXT_MAX_LENGTH = 50_000;

export function isWithinLength(value: string, maxLength: number) {
  return value.length <= maxLength;
}
