import { AdminAiSubnav } from "@/components/admin-ai-subnav";
import { AdminSettingsForm } from "@/components/admin-settings-form";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { getSetting } from "@/lib/settings";
import styles from "../../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "도구 연결 설정",
  description:
    "AI 리서치에 사용할 도구 엔드포인트와 호출 제한 시간을 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminAiMcpPage() {
  const db = getDatabase();

  return (
    <AppShell variant="admin">
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>도구 연결</h1>
              <p>
                법령, 판례, 공공데이터 도구를 라우팅하기 위한 엔드포인트를
                관리해요. 리서치 하네스는 설정된 도구부터 우선 사용합니다.
              </p>
            </div>
            <span className={styles.badge}>AI 설정</span>
          </div>
          <AdminAiSubnav active="mcp" />
        </section>

        <section className={styles.section}>
          <div className={styles.contentCard}>
            <AdminSettingsForm
              description="엔드포인트가 비어 있으면 해당 도구는 근거 후보 단계에서 예정 상태로 표시됩니다."
              fields={[
                {
                  key: "mcp_korean_law_endpoint",
                  label: "korean-law-mcp",
                  placeholder: "http://127.0.0.1:8000/mcp",
                  value: getSetting(db, "mcp_korean_law_endpoint") ?? "",
                },
                {
                  key: "mcp_case_law_endpoint",
                  label: "Case Law API 도구",
                  placeholder: "http://127.0.0.1:8001/mcp",
                  value: getSetting(db, "mcp_case_law_endpoint") ?? "",
                },
                {
                  key: "mcp_timeout_ms",
                  label: "도구 호출 제한 시간(ms)",
                  placeholder: "15000",
                  value: getSetting(db, "mcp_timeout_ms") ?? "15000",
                },
              ]}
              scope="mcp"
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
