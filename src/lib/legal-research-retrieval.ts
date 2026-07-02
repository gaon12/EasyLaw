import type { SqliteDatabase } from "./db";
import { fetchOpenLawRecords, type OpenLawTarget } from "./external-law";
import type { ResearchEvidence, ResearchSearchPlan } from "./legal-research";
import { getSetting } from "./settings";

type LocalJudgment = {
  case_number: string;
  court_name: string;
  decided_on: string;
  original_text: string | null;
  source_provider: string;
  source_summary: string | null;
  source_url: string | null;
  title: string;
};

export async function retrieveResearchEvidence(
  db: SqliteDatabase,
  plan: ResearchSearchPlan,
): Promise<ResearchEvidence[]> {
  const localEvidence = findLocalEvidence(db, plan.searchQueries);
  const externalEvidence = getSetting(db, "open_law_oc")
    ? await findOpenLawEvidence(db, plan)
    : [];

  return deduplicateEvidence([...localEvidence, ...externalEvidence])
    .slice(0, 12)
    .map((evidence, index) => ({ ...evidence, id: `E${index + 1}` }));
}

function findLocalEvidence(
  db: SqliteDatabase,
  searchQueries: string[],
): Omit<ResearchEvidence, "id">[] {
  const terms = uniqueSearchTerms(searchQueries);
  if (terms.length === 0) {
    return [];
  }

  const rows = db
    .prepare<string[], LocalJudgment>(
      `SELECT case_number, court_name, decided_on, original_text,
        source_provider, source_summary, source_url, title
      FROM judgments
      WHERE visibility = 'public'
        AND (${terms
          .map(
            () =>
              "(title LIKE ? OR case_number LIKE ? OR source_summary LIKE ? OR original_text LIKE ?)",
          )
          .join(" OR ")})
      ORDER BY decided_on DESC
      LIMIT 8`,
    )
    .all(
      ...terms.flatMap((term) => [
        `%${term}%`,
        `%${term}%`,
        `%${term}%`,
        `%${term}%`,
      ]),
    );

  return rows.map((row) => ({
    confidence: row.source_provider.startsWith("open-law") ? "high" : "medium",
    source: row.source_provider,
    summary:
      compactExcerpt(row.source_summary ?? row.original_text) ??
      `${row.court_name}이 ${row.decided_on}에 선고한 판결입니다.`,
    title: `${row.case_number} ${row.title}`,
    url: row.source_url ?? undefined,
  }));
}

async function findOpenLawEvidence(
  db: SqliteDatabase,
  plan: ResearchSearchPlan,
): Promise<Array<Omit<ResearchEvidence, "id">>> {
  const searches = plan.searchQueries
    .slice(0, 3)
    .flatMap((query) =>
      plan.targets.slice(0, 3).map((target) => ({ query, target })),
    );
  const pages = await Promise.all(
    searches.map(({ query, target }) =>
      fetchOpenLawRecords(db, target, query, { display: 5 }),
    ),
  );

  return pages.flat().map((record) => ({
    confidence: "high",
    source: record.sourceProvider,
    summary:
      compactExcerpt(record.summary ?? record.originalText) ??
      `${record.courtName}이 ${record.decidedOn}에 공개한 자료입니다.`,
    title: `${record.caseNumber} ${record.title}`,
    url: record.sourceUrl,
  }));
}

function uniqueSearchTerms(queries: string[]) {
  return [
    ...new Set(
      queries.flatMap((query) =>
        query
          .split(/\s+/)
          .map((term) => term.replace(/[^\p{L}\p{N}]/gu, "").trim())
          .filter((term) => term.length >= 2),
      ),
    ),
  ].slice(0, 8);
}

function compactExcerpt(value: string | undefined | null) {
  if (!value) {
    return null;
  }
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 360 ? `${compact.slice(0, 357)}...` : compact;
}

function deduplicateEvidence(evidence: Array<Omit<ResearchEvidence, "id">>) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.source}:${item.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function isOpenLawTarget(value: string): value is OpenLawTarget {
  return ["prec", "detc", "law", "admrul", "ordin"].includes(value);
}
