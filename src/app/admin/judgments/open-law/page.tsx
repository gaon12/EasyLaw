import { AdminJudgmentDataSubnav } from "@/components/admin-judgment-data-subnav";
import { AdminSettingsForm } from "@/components/admin-settings-form";
import { SearchableTable } from "@/components/list-explorer";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { listIntegrationEvents } from "@/lib/integration-events";
import { pageMetadata } from "@/lib/metadata";
import { getSetting } from "@/lib/settings";
import styles from "../../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "판결문 API 설정",
  description:
    "국가법령정보센터 판례 API 호출에 사용할 OC 설정과 동기화 기록을 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminOpenLawPage() {
  const db = getDatabase();
  const events = listIntegrationEvents(db, "open-law");
  const openLawOc = getSetting(db, "open_law_oc") ?? "";
  const dataGoKrKey = getSetting(db, "data_go_kr_api_key") ?? "";

  return (
    <AppShell
      variant="admin"
      subNavigation={<AdminJudgmentDataSubnav active="openLaw" />}
    >
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>판결문 API 설정</h1>
              <p>
                국가법령정보센터 판례 API 호출에 필요한 OC 키와 최근 호출 기록을
                관리해요.
              </p>
            </div>
            <span className={styles.badge}>open.law.go.kr</span>
          </div>
          <div className={styles.contentCard}>
            <AdminSettingsForm
              description={
                openLawOc || dataGoKrKey
                  ? "저장된 API 키가 있어요. 새 값을 입력하면 해당 키가 교체됩니다."
                  : "API 키를 저장하면 판결문 수집과 공휴일 달력 도구가 공공 API를 사용합니다."
              }
              fields={[
                {
                  key: "open_law_oc",
                  label: "OC 키",
                  placeholder: "새 키를 입력할 때만 저장",
                  secret: true,
                  value: openLawOc,
                },
                {
                  key: "data_go_kr_api_key",
                  label: "data.go.kr ServiceKey",
                  placeholder: "한국천문연구원 특일 정보 API 키",
                  secret: true,
                  value: dataGoKrKey,
                },
              ]}
              scope="openLaw"
            />
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>최근 호출 기록</h2>
            <SearchableTable
              columns={["시각", "동작", "상태", "메시지"]}
              emptyMessage="표시할 판결문 API 호출 기록이 없어요."
              rows={events.map((event) => ({
                cells: [
                  { kind: "datetime", value: event.createdAt },
                  event.action,
                  event.status,
                  event.message,
                ],
                id: `${event.createdAt}-${event.action}`,
                searchText: `${event.createdAt} ${event.action} ${event.status} ${event.message ?? ""}`,
              }))}
              searchLabel="호출 기록 검색"
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
