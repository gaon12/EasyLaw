import { getDatabase } from "@/lib/db";
import { latestDictionaryImport } from "@/lib/dictionary";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../../page.module.css";
import { DictionaryAdminPage, LatestDictionaryImport } from "../_components";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "최근 사전 업데이트",
  description: "가장 최근에 실행한 사전 업데이트 결과를 확인합니다.",
  robots: { index: false, follow: false },
});

export default function AdminDictionaryLatestPage() {
  const db = getDatabase();
  const latest = latestDictionaryImport(db);

  return (
    <DictionaryAdminPage
      active="latest"
      badge="업데이트 상태"
      description="가장 최근에 실행한 사전 업데이트의 완료 시각, 저장 결과, 오류를 확인합니다."
      title="최근 업데이트"
    >
      <section className={styles.section}>
        <div className={styles.contentCard}>
          <h2 className={styles.panelTitle}>최근 결과</h2>
          <LatestDictionaryImport latest={latest} />
        </div>
      </section>
    </DictionaryAdminPage>
  );
}
