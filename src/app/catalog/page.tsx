import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { syncExternalCatalog } from "@/lib/external-law";
import { JUDGMENT_SEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import { pageMetadata } from "@/lib/metadata";
import { getPublicJudgments } from "@/lib/queries";
import { JudgmentExplorer } from "../easylaw-client";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "판결문 검색",
  description:
    "사건번호, 법원명, 판결문 제목으로 공개 판결문을 검색하고 쉬운 설명을 확인하세요.",
  path: "/catalog",
});

export default async function CatalogPage({
  searchParams,
}: PageProps<"/catalog">) {
  const { q, view } = await searchParams;
  const initialQuery = typeof q === "string" ? q : "";
  const isRecentView = view === "recent" && !initialQuery;
  const db = getDatabase();
  await syncExternalCatalog(db);
  const allJudgments = getPublicJudgments(db);
  const normalizedQuery = initialQuery.trim().toLowerCase();
  const judgments = normalizedQuery
    ? allJudgments.filter((judgment) =>
        [
          judgment.caseNumber,
          judgment.courtName,
          judgment.title,
          judgment.caseType,
        ].some((value) => value.toLowerCase().includes(normalizedQuery)),
      )
    : allJudgments;

  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>
                {initialQuery
                  ? "판결문 검색 결과"
                  : isRecentView
                    ? "공개 판결문 전체 보기"
                    : "판결문 검색"}
              </h1>
              <p>
                {isRecentView
                  ? "최근 공개된 판결문을 최신순으로 모아 볼 수 있어요."
                  : "사건번호, 법원명, 판결문 제목으로 공개 판결문을 바로 찾아요. 직접 붙여넣은 내 문서는 로그인 후 비공개로 저장할 수 있어요."}
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
            initialJudgments={judgments}
            initialQuery={initialQuery}
            showWorkspace={!initialQuery && !isRecentView}
          />
        </section>
      </main>
    </AppShell>
  );
}
