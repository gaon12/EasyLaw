import { cookies } from "next/headers";
import { AppShell } from "@/components/site-chrome";
import { listBookmarkedJudgmentIds } from "@/lib/bookmarks";
import { getDatabase } from "@/lib/db";
import { translate } from "@/lib/i18n";
import {
  matchesJudgmentSearch,
  parseJudgmentCaseType,
  parseJudgmentCategories,
  parseJudgmentSearchQuery,
  parseJudgmentSort,
  sortJudgments,
} from "@/lib/judgment-search";
import { pageMetadata } from "@/lib/metadata";
import { getPublicJudgments } from "@/lib/queries";
import { getRequestLocale } from "@/lib/server-locale";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { JudgmentExplorer } from "../easylaw-client";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

const CATALOG_PAGE_SIZE = 15;

export const metadata = pageMetadata({
  title: "판결문·법령 검색",
  description:
    "사건번호, 법원명, 제목으로 공개 판결문과 법령을 검색하고 쉬운 설명을 확인하세요.",
  path: "/catalog",
});

export default async function CatalogPage({
  searchParams,
}: PageProps<"/catalog">) {
  const { cat, from, page, q, sort, to, type, view } = await searchParams;
  const initialQuery = typeof q === "string" ? q : "";
  const isRecentView = view === "recent" && !initialQuery;
  const currentPage = parseCatalogPage(page);
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  const allJudgments = getPublicJudgments(db);
  const initialBookmarkedIds = user
    ? listBookmarkedJudgmentIds(db, user.id)
    : [];
  const filters = parseJudgmentSearchQuery(initialQuery);
  const categories = parseJudgmentCategories(cat);
  if (categories) {
    filters.categories = categories;
  }
  const caseType = parseJudgmentCaseType(type);
  if (caseType) {
    filters.caseType = caseType;
  }
  const yearFrom = parseCatalogYear(from);
  if (yearFrom) {
    filters.yearFrom = yearFrom;
  }
  const yearTo = parseCatalogYear(to);
  if (yearTo) {
    filters.yearTo = yearTo;
  }
  filters.sort = parseJudgmentSort(sort);
  const filteredJudgments = sortJudgments(
    allJudgments.filter((judgment) => matchesJudgmentSearch(judgment, filters)),
    filters.sort,
  );
  const pageCount = Math.max(
    1,
    Math.ceil(filteredJudgments.length / CATALOG_PAGE_SIZE),
  );
  const safePage = Math.min(currentPage, pageCount);
  const judgments = filteredJudgments.slice(
    (safePage - 1) * CATALOG_PAGE_SIZE,
    safePage * CATALOG_PAGE_SIZE,
  );
  const locale = await getRequestLocale();
  const titleKey = initialQuery
    ? "catalog.titleResults"
    : isRecentView
      ? "catalog.titleRecent"
      : "catalog.title";
  const descriptionKey = isRecentView
    ? "catalog.descriptionRecent"
    : "catalog.description";

  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1 data-i18n={titleKey}>{translate(locale, titleKey)}</h1>
              <p data-i18n={descriptionKey}>
                {translate(locale, descriptionKey)}
              </p>
            </div>
            <span className={styles.badge}>확인된 정보 우선</span>
          </div>
          <JudgmentExplorer
            initialPage={safePage}
            initialBookmarkedIds={initialBookmarkedIds}
            initialFilters={filters}
            initialJudgments={judgments}
            initialTotalCount={filteredJudgments.length}
            initialView={isRecentView ? "recent" : undefined}
            showWorkspace={!isRecentView}
          />
        </section>
      </main>
    </AppShell>
  );
}

function parseCatalogPage(value: unknown) {
  if (typeof value !== "string") {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseCatalogYear(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1900 && parsed <= 2100 ? parsed : undefined;
}
