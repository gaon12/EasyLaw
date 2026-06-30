import { AdminSettingsForm } from "@/components/admin-settings-form";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { listIntegrationEvents } from "@/lib/integration-events";
import { pageMetadata } from "@/lib/metadata";
import { hasSetting } from "@/lib/settings";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "공개법령 API 설정",
  description:
    "국가법령정보센터 판례 API 호출에 사용할 OC 키와 동기화 기록을 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminOpenLawPage() {
  const db = getDatabase();
  const events = listIntegrationEvents(db, "open-law");

  return (
    <AppShell variant="admin">
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>공개법령 API 설정</h1>
              <p>
                국가법령정보센터 판례 목록 API를 호출해 공개 판결문 메타데이터를
                DB에 저장합니다. OC 키는 암호화해 저장하고 다시 표시하지
                않습니다.
              </p>
            </div>
            <span className={styles.badge}>open.law.go.kr</span>
          </div>
          <div className={styles.contentCard}>
            <AdminSettingsForm
              description={
                hasSetting(db, "open_law_oc")
                  ? "저장된 OC 키가 있어요. 새 값을 입력하면 교체됩니다."
                  : "OC 키를 저장하면 판례 검색과 카탈로그 동기화가 공개법령 API를 사용합니다."
              }
              fields={[
                {
                  key: "open_law_oc",
                  label: "OC 키",
                  placeholder: "새 키를 입력할 때만 저장",
                  secret: true,
                },
              ]}
              scope="openLaw"
            />
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>최근 호출 기록</h2>
            <IntegrationEventTable events={events} />
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function IntegrationEventTable({
  events,
}: {
  events: ReturnType<typeof listIntegrationEvents>;
}) {
  if (events.length === 0) {
    return <p>아직 공개법령 API 호출 기록이 없어요.</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>시각</th>
            <th>동작</th>
            <th>상태</th>
            <th>메시지</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={`${event.createdAt}-${event.action}`}>
              <td>{event.createdAt}</td>
              <td>{event.action}</td>
              <td>{event.status}</td>
              <td>{event.message ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
