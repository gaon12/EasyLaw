import { AdminSettingsForm } from "@/components/admin-settings-form";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { getSetting, hasSetting } from "@/lib/settings";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "공개법령 API 설정",
  description:
    "국가법령정보센터 판례 API 호출에 사용할 OC 키와 API 주소를 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminOpenLawPage() {
  const db = getDatabase();

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
                {
                  key: "open_law_api_base_url",
                  label: "API Base URL",
                  placeholder: "https://www.law.go.kr/DRF/lawSearch.do",
                  value: getSetting(db, "open_law_api_base_url") ?? "",
                },
              ]}
              scope="openLaw"
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
