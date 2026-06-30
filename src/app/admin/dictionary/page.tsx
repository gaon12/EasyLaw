import { DictionaryUpdateButton } from "@/components/dictionary-update-button";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { latestDictionaryImport } from "@/lib/dictionary";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "용어 사전 관리",
  description:
    "표준국어대사전 데이터를 업데이트하고 용어 설명 기능을 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminDictionaryPage() {
  const latest = latestDictionaryImport(getDatabase());

  return (
    <AppShell variant="admin">
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>용어 사전 관리</h1>
              <p>
                드래그한 어려운 용어를 먼저 로컬 표준국어대사전에서 찾고, 필요한
                경우 MCP/AI 설명을 덧붙이는 기반 데이터입니다.
              </p>
            </div>
            <span className={styles.badge}>표준국어대사전</span>
          </div>
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>데이터 업데이트</h2>
            <p>
              국립국어원 다운로드 ZIP을 임시 파일로 받은 뒤 JSON을 읽어 DB에
              저장합니다. 반영이 끝나면 ZIP과 압축 해제 데이터는 삭제합니다.
            </p>
            <DictionaryUpdateButton />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>최근 업데이트</h2>
            {latest ? (
              <p>
                상태: {latest.status} · 반영 수:{" "}
                {latest.imported_count.toLocaleString("ko-KR")} · 완료 시각:{" "}
                {latest.completed_at ?? "-"}
                {latest.failure_reason
                  ? ` · 오류: ${latest.failure_reason}`
                  : ""}
              </p>
            ) : (
              <p>아직 업데이트 이력이 없어요.</p>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
