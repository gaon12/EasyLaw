import { cookies } from "next/headers";
import { AppShell } from "@/components/site-chrome";
import { listBookmarkedJudgmentIds } from "@/lib/bookmarks";
import { getDatabase } from "@/lib/db";
import { translate } from "@/lib/i18n";
import { JUDGMENT_SEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import {
  matchesJudgmentSearch,
  parseJudgmentSearchQuery,
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
  title: "판결문 검색",
  description:
    "사건번호, 법원명, 판결문 제목으로 공개 판결문을 검색하고 쉬운 설명을 확인하세요.",
  path: "/catalog",
});

export default async function CatalogPage({
  searchParams,
}: PageProps<"/catalog">) {
  const { page, q, view } = await searchParams;
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
  const filteredJudgments = initialQuery.trim()
    ? allJudgments.filter((judgment) =>
        matchesJudgmentSearch(judgment, filters),
      )
    : allJudgments;
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
          {initialQuery && (
            <form action="/catalog" className={styles.searchForm}>
              <input
                aria-label="판결문 검색어"
                defaultValue={initialQuery}
                maxLength={JUDGMENT_SEARCH_QUERY_MAX_LENGTH}
                name="q"
                placeholder="사건번호, 법원명, 판결문 제목"
              />
              <button className={styles.primaryButton} type="submit">
                다시 검색
              </button>
            </form>
          )}
          <JudgmentExplorer
            initialPage={safePage}
            initialBookmarkedIds={initialBookmarkedIds}
            initialJudgments={judgments}
            initialQuery={initialQuery}
            initialTotalCount={filteredJudgments.length}
            initialView={isRecentView ? "recent" : undefined}
            showWorkspace={!initialQuery && !isRecentView}
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
