import type { SqliteDatabase } from "./db";
import { searchJudgmentTexts } from "./judgment-texts";
import type { McpToolCallResult } from "./mcp-client";

const SEARCH_LIMIT = 8;

type LocalJudgmentRow = {
  case_type: string;
  id: string;
  case_number: string;
  court_name: string;
  decided_on: string;
  original_text: string | null;
  source_provider: string;
  source_summary: string | null;
  source_url: string | null;
  title: string;
};

type SearchFilters = {
  caseType: string | null;
  courtName: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  limit: number;
  provider: string | null;
};

export function searchLocalLegalData(
  db: SqliteDatabase,
  args: Record<string, unknown>,
): McpToolCallResult {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    return { content: [], isError: false, structuredContent: { records: [] } };
  }
  const filters = parseSearchFilters(args);

  const fullTextHits = searchJudgmentTexts(db, query, filters.limit);
  const snippetById = new Map(
    fullTextHits.map((hit) => [hit.judgmentId, hit.snippet]),
  );
  const fullTextRows = fetchByIds(
    db,
    fullTextHits.map((hit) => hit.judgmentId),
    filters,
  );
  const metadataRows = fetchByMetadata(db, query, filters);
  const fallbackRows =
    fullTextRows.length === 0 && metadataRows.length === 0
      ? fetchByOriginalTextLike(db, query, filters)
      : [];

  const rows: LocalJudgmentRow[] = [];
  const seen = new Set<string>();
  for (const row of [...fullTextRows, ...metadataRows, ...fallbackRows]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      rows.push(row);
    }
    if (rows.length >= filters.limit) {
      break;
    }
  }

  const records = rows.map((row) => ({
    caseNumber: row.case_number,
    caseType: row.case_type,
    content: summarize(row.original_text ?? row.source_summary ?? row.title),
    courtName: row.court_name,
    decidedOn: row.decided_on,
    documentId: row.id,
    provider: row.source_provider,
    source: providerLabel(row.source_provider, row.court_name),
    summary: summarize(
      snippetById.get(row.id) ??
        row.source_summary ??
        row.original_text ??
        row.title,
    ),
    title: `${row.case_number} ${row.title}`,
    url: row.source_url ?? undefined,
  }));

  return {
    content:
      records.length > 0
        ? [{ text: JSON.stringify({ records }), type: "text" }]
        : [],
    isError: false,
    structuredContent: { records },
  };
}

const judgmentSelect = `SELECT judgments.id, case_number, case_type, court_name,
    decided_on, title, source_provider, source_url, source_summary,
    judgment_texts.original_text AS original_text
  FROM judgments
  LEFT JOIN judgment_texts ON judgment_texts.judgment_id = judgments.id
  WHERE visibility = 'public'`;

function fetchByIds(
  db: SqliteDatabase,
  ids: string[],
  filters: SearchFilters,
): LocalJudgmentRow[] {
  if (ids.length === 0) {
    return [];
  }
  const filter = sqlFilters(filters);
  const rows = db
    .prepare<Array<string | number>, LocalJudgmentRow>(
      `${judgmentSelect}
        AND judgments.id IN (${ids.map(() => "?").join(", ")})
        ${filter.sql}`,
    )
    .all(...ids, ...filter.params);
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows.sort(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  );
}

function fetchByMetadata(
  db: SqliteDatabase,
  query: string,
  filters: SearchFilters,
) {
  const tokens = tokenize(query);
  const filter = sqlFilters(filters);
  return db
    .prepare<Array<string | number>, LocalJudgmentRow>(
      `${judgmentSelect}
        AND (${tokens
          .map(
            () => `(case_number LIKE ?
              OR court_name LIKE ?
              OR title LIKE ?
              OR source_summary LIKE ?)`,
          )
          .join(" OR ")})
       ${filter.sql}
       ORDER BY decided_on DESC
       LIMIT ?`,
    )
    .all(
      ...tokens.flatMap((token) => Array.from({ length: 4 }, () => token)),
      ...filter.params,
      filters.limit,
    );
}

function fetchByOriginalTextLike(
  db: SqliteDatabase,
  query: string,
  filters: SearchFilters,
) {
  const tokens = tokenize(query);
  const filter = sqlFilters(filters);
  return db
    .prepare<Array<string | number>, LocalJudgmentRow>(
      `${judgmentSelect}
        AND (${tokens
          .map(() => "judgment_texts.original_text LIKE ?")
          .join(" OR ")})
       ${filter.sql}
       ORDER BY decided_on DESC
       LIMIT ?`,
    )
    .all(...tokens, ...filter.params, filters.limit);
}

function tokenize(query: string) {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.replaceAll(/[%"_]/g, "").trim())
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  return (tokens.length > 0 ? tokens : [query]).map((token) => `%${token}%`);
}

function parseSearchFilters(args: Record<string, unknown>): SearchFilters {
  return {
    caseType: stringFilter(args.caseType),
    courtName: stringFilter(args.courtName),
    dateFrom: dateFilter(args.dateFrom),
    dateTo: dateFilter(args.dateTo),
    limit: integerLimit(args.limit),
    provider: stringFilter(args.provider),
  };
}

function sqlFilters(filters: SearchFilters) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.caseType) {
    clauses.push("case_type = ?");
    params.push(filters.caseType);
  }
  if (filters.provider) {
    clauses.push("source_provider = ?");
    params.push(filters.provider);
  }
  if (filters.courtName) {
    clauses.push("court_name LIKE ?");
    params.push(`%${escapeLike(filters.courtName)}%`);
  }
  if (filters.dateFrom) {
    clauses.push("decided_on >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push("decided_on <= ?");
    params.push(filters.dateTo);
  }
  return {
    params,
    sql: clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : "",
  };
}

function stringFilter(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateFilter(value: unknown) {
  const text = stringFilter(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function integerLimit(value: unknown) {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(20, Math.max(1, value))
    : SEARCH_LIMIT;
}

function escapeLike(value: string) {
  return value.replaceAll(/[%"_]/g, "");
}

function providerLabel(provider: string, courtName: string) {
  const labels: Record<string, string> = {
    "open-law": "국가법령정보센터 판례",
    "open-law-administrative-rule": "국가법령정보센터 행정규칙",
    "open-law-constitutional": "국가법령정보센터 헌재결정례",
    "open-law-law": "국가법령정보센터 법령",
    "open-law-ordinance": "국가법령정보센터 자치법규",
  };
  return labels[provider] ?? courtName;
}

function summarize(value: string) {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length > 700
    ? `${normalized.slice(0, 697)}...`
    : normalized;
}
