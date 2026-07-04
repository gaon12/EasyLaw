import { SearchableTable } from "@/components/list-explorer";
import { getDatabase } from "@/lib/db";
import { listIntegrationEvents } from "@/lib/integration-events";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../../page.module.css";
import { DictionaryAdminPage, dictionaryEventDisplay } from "../_components";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "사전 작업 기록",
  description: "사전 다운로드와 가져오기 작업의 최근 기록을 확인합니다.",
  robots: { index: false, follow: false },
});

export default function AdminDictionaryEventsPage() {
  const db = getDatabase();
  const events = listIntegrationEvents(db, "dictionary");

  return (
    <DictionaryAdminPage
      active="events"
      badge="작업 기록"
      description="사전 다운로드와 가져오기 작업이 언제 실행됐고 어떤 결과를 냈는지 확인합니다."
      title="최근 작업 기록"
    >
      <section className={styles.section}>
        <div className={styles.contentCard}>
          <h2 className={styles.panelTitle}>작업 기록</h2>
          <SearchableTable
            columns={["시각", "동작", "상태", "메시지"]}
            emptyMessage="표시할 사전 작업 기록이 없어요."
            rows={events.map((event) => {
              const displayEvent = dictionaryEventDisplay(event);
              return {
                cells: [
                  { kind: "datetime", value: event.createdAt },
                  event.action,
                  displayEvent.status,
                  displayEvent.message,
                ],
                id: `${event.createdAt}-${event.action}`,
                searchText: `${event.createdAt} ${event.action} ${displayEvent.status} ${displayEvent.message ?? ""}`,
              };
            })}
            searchLabel="작업 기록 검색"
          />
        </div>
      </section>
    </DictionaryAdminPage>
  );
}
