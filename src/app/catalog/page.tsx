import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { syncSampleExternalCatalog } from "@/lib/external-law";
import { getPublicJudgments } from "@/lib/queries";
import { JudgmentExplorer } from "../easylaw-client";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: PageProps<"/catalog">) {
  const { mode, q } = await searchParams;
  const initialQuery = typeof q === "string" ? q : "";
  const isQuestionMode = mode === "question";
  const db = getDatabase();
  await syncSampleExternalCatalog(db);
  const judgments = getPublicJudgments(db);

  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>판결문 찾기</h1>
              <p>
                공개 출처가 확인된 판결문을 검색하고, 쉬운 설명 생성이 끝나면
                이메일로 알림을 받아요.
              </p>
            </div>
            <span className={styles.badge}>확인된 정보 우선</span>
          </div>
          <JudgmentExplorer
            initialJudgments={judgments}
            initialQuery={initialQuery}
            questionMode={isQuestionMode}
          />
        </section>
      </main>
    </AppShell>
  );
}
