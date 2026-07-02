import { AdminJudgmentCollectionPanel } from "@/components/admin-judgment-collection-panel";
import { AdminJudgmentDataSubnav } from "@/components/admin-judgment-data-subnav";
import { SearchableTable } from "@/components/list-explorer";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import {
  getJudgmentCollectionStatus,
  listJudgmentCollectionRuns,
} from "@/lib/judgment-collection";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "법률 데이터 자동 수집",
  description: "공개 법률 데이터 자동 수집 주기와 수동 실행을 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminJudgmentCollectionPage() {
  const db = getDatabase();
  const collectionStatus = getJudgmentCollectionStatus(db);
  const collectionRuns = listJudgmentCollectionRuns(db);

  return (
    <AppShell
      variant="admin"
      subNavigation={<AdminJudgmentDataSubnav active="collection" />}
    >
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>법률 데이터 자동 수집</h1>
              <p>
                판례, 헌재결정례, 현행 법령을 주기적으로 확인하고 새 데이터만
                저장해요.
              </p>
            </div>
            <span className={styles.badge}>Open Law</span>
          </div>
          <AdminJudgmentCollectionPanel status={collectionStatus} />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>수집 실행 이력</h2>
              <p>자동 실행과 수동 실행 결과를 함께 확인해요.</p>
            </div>
          </div>
          <SearchableTable
            columns={["시각", "실행", "상태", "결과", "실패 사유"]}
            emptyMessage="아직 법률 데이터 수집 실행 이력이 없어요."
            rows={collectionRuns.map((run) => {
              const result = `${run.importedCount}건 / 신규 ${run.createdCount} / 갱신 ${run.updatedCount}`;
              const scope = "전체 판례·헌재·법령";
              return {
                cells: [
                  { kind: "datetime", value: run.startedAt },
                  run.trigger === "manual" ? "수동" : "자동",
                  run.status,
                  { kind: "lines", lines: [scope, result] },
                  run.failureReason,
                ],
                id: run.id,
                searchText: `${run.startedAt} ${run.trigger} ${run.status} ${scope} ${result} ${run.failureReason ?? ""}`,
              };
            })}
            searchLabel="수집 이력 검색"
          />
        </section>
      </main>
    </AppShell>
  );
}
