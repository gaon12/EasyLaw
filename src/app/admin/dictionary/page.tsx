import { DictionaryUpdateButton } from "@/components/dictionary-update-button";
import { LegalTermForm } from "@/components/legal-term-form";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { latestDictionaryImport } from "@/lib/dictionary";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "용어 사전 관리",
  description: "법률 용어, 한국어기초사전, 표준국어대사전 데이터를 관리합니다.",
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
                용어 설명은 자체 법률 용어 사전, 한국어기초사전, 표준국어대사전
                순서로 확인한 뒤 문맥 설명을 덧붙입니다.
              </p>
            </div>
            <span className={styles.badge}>우선순위 사전</span>
          </div>
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>공개 사전 데이터 업데이트</h2>
            <p>
              한국어기초사전은 GET ZIP, 표준국어대사전은 POST ZIP으로 받은 뒤
              JSON만 DB에 저장합니다. 반영이 끝나면 임시 파일은 삭제합니다.
            </p>
            <DictionaryUpdateButton />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>자체 법률 용어 사전</h2>
            <p>
              서비스가 반드시 먼저 보여줘야 하는 법률 용어 설명을 등록합니다.
              같은 단어가 여러 사전에 있어도 자체 설명이 1순위입니다.
            </p>
            <LegalTermForm />
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
