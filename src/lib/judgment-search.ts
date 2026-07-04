import type { JudgmentListItem } from "./types";

export type JudgmentCaseTypeFilter =
  | "civil"
  | "criminal"
  | "administrative"
  | "family"
  | "constitutional"
  | "law";

export type JudgmentCategoryFilter = "judgment" | "law";

export type JudgmentSortOption = "newest" | "oldest" | "title";

export const JUDGMENT_SORT_OPTIONS: Array<{
  value: JudgmentSortOption;
  label: string;
}> = [
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
  { value: "title", label: "제목순" },
];

export type JudgmentSearchFilters = {
  text: string;
  yearFrom?: number;
  yearTo?: number;
  caseType?: JudgmentCaseTypeFilter;
  categories?: JudgmentCategoryFilter[];
  sort?: JudgmentSortOption;
};

/** 문서의 상위 카테고리(판결문/법령)를 반환한다. */
export function judgmentCategory(caseType: string): JudgmentCategoryFilter {
  return caseType === "law" ? "law" : "judgment";
}

export function displayJudgmentCategory(category: JudgmentCategoryFilter) {
  return category === "law" ? "법령" : "판결문";
}

export function parseJudgmentCategories(
  value: unknown,
): JudgmentCategoryFilter[] | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const categories = [...new Set(raw)].filter(
    (entry): entry is JudgmentCategoryFilter =>
      entry === "judgment" || entry === "law",
  );
  return categories.length > 0 ? categories : undefined;
}

export function parseJudgmentSort(
  value: unknown,
): JudgmentSortOption | undefined {
  return value === "newest" || value === "oldest" || value === "title"
    ? value
    : undefined;
}

export function parseJudgmentCaseType(
  value: unknown,
): JudgmentCaseTypeFilter | undefined {
  return typeof value === "string" && isJudgmentCaseTypeFilter(value)
    ? value
    : undefined;
}

export function sortJudgments<
  T extends Pick<JudgmentListItem, "decidedOn" | "title">,
>(judgments: T[], sort: JudgmentSortOption = "newest"): T[] {
  const sorted = [...judgments];
  if (sort === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    return sorted;
  }
  sorted.sort((a, b) =>
    sort === "oldest"
      ? a.decidedOn.localeCompare(b.decidedOn)
      : b.decidedOn.localeCompare(a.decidedOn),
  );
  return sorted;
}

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
  if (
    filters.categories &&
    filters.categories.length > 0 &&
    !filters.categories.includes(judgmentCategory(judgment.caseType))
  ) {
    return false;
  }

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
