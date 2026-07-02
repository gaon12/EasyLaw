import type { JudgmentListItem } from "./types";

export type JudgmentCaseTypeFilter =
  | "civil"
  | "criminal"
  | "administrative"
  | "family"
  | "constitutional"
  | "law";

export type JudgmentSearchFilters = {
  text: string;
  yearFrom?: number;
  yearTo?: number;
  caseType?: JudgmentCaseTypeFilter;
};

const caseTypeAliases: Record<string, JudgmentCaseTypeFilter> = {
  civil: "civil",
  민사: "civil",
  criminal: "criminal",
  형사: "criminal",
  administrative: "administrative",
  행정: "administrative",
  family: "family",
  가사: "family",
  constitutional: "constitutional",
  헌재: "constitutional",
  헌법: "constitutional",
  law: "law",
  법령: "law",
  법률: "law",
};

export const judgmentSearchTagExamples = [
  "연도:2024-2026",
  "종류:민사",
  "종류:형사",
  "종류:행정",
  "종류:헌재",
  "종류:법령",
] as const;

export function parseJudgmentSearchQuery(
  rawQuery: string,
): JudgmentSearchFilters {
  const filters: JudgmentSearchFilters = { text: "" };
  const textParts: string[] = [];

  for (const token of rawQuery.trim().split(/\s+/).filter(Boolean)) {
    const separatorIndex = token.indexOf(":");
    if (separatorIndex < 1) {
      textParts.push(token);
      continue;
    }

    const key = token.slice(0, separatorIndex).toLowerCase();
    const value = token.slice(separatorIndex + 1);
    if (isYearKey(key)) {
      const yearRange = parseYearRange(value);
      if (yearRange) {
        filters.yearFrom = yearRange.from;
        filters.yearTo = yearRange.to;
        continue;
      }
    }

    if (isCaseTypeKey(key)) {
      const caseType = caseTypeAliases[value.toLowerCase()] ?? value;
      if (isJudgmentCaseTypeFilter(caseType)) {
        filters.caseType = caseType;
        continue;
      }
    }

    textParts.push(token);
  }

  filters.text = textParts.join(" ").trim();
  return filters;
}

export function matchesJudgmentSearch(
  judgment: JudgmentListItem,
  filters: JudgmentSearchFilters,
) {
  if (filters.caseType && judgment.caseType !== filters.caseType) {
    return false;
  }

  if (filters.yearFrom || filters.yearTo) {
    const year = Number.parseInt(judgment.decidedOn.slice(0, 4), 10);
    if (Number.isNaN(year)) {
      return false;
    }
    if (filters.yearFrom && year < filters.yearFrom) {
      return false;
    }
    if (filters.yearTo && year > filters.yearTo) {
      return false;
    }
  }

  if (!filters.text) {
    return true;
  }

  const normalizedText = filters.text.toLowerCase();
  return [
    judgment.caseNumber,
    judgment.courtName,
    judgment.title,
    judgment.caseType,
    displayJudgmentCaseType(judgment.caseType),
  ].some((value) => value.toLowerCase().includes(normalizedText));
}

export function displayJudgmentCaseType(caseType: string) {
  switch (caseType) {
    case "civil":
      return "민사";
    case "criminal":
      return "형사";
    case "administrative":
      return "행정";
    case "family":
      return "가사";
    case "constitutional":
      return "헌재";
    case "law":
      return "법령";
    default:
      return caseType;
  }
}

function isYearKey(key: string) {
  return key === "연도" || key === "year";
}

function isCaseTypeKey(key: string) {
  return key === "종류" || key === "type";
}

function parseYearRange(value: string) {
  const match = /^(\d{4})(?:-(\d{4}))?$/.exec(value);
  if (!match) {
    return null;
  }

  const from = Number.parseInt(match[1], 10);
  const to = Number.parseInt(match[2] ?? match[1], 10);
  if (from < 1900 || to > 2100 || from > to) {
    return null;
  }

  return { from, to };
}

function isJudgmentCaseTypeFilter(
  value: string,
): value is JudgmentCaseTypeFilter {
  return (
    value === "civil" ||
    value === "criminal" ||
    value === "administrative" ||
    value === "family" ||
    value === "constitutional" ||
    value === "law"
  );
}
