import { AdminSettingsForm } from "@/components/admin-settings-form";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { getSetting, hasSetting } from "@/lib/settings";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "AI 설정",
  description: "AI 질문에 사용할 모델 API와 MCP 도구 연결을 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminAiPage() {
  const db = getDatabase();

  return (
    <AppShell variant="admin">
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>AI 설정</h1>
              <p>
                질문 답변에 쓰는 모델 API와 외부 도구 연결을 한곳에서 관리해요.
                공통 설정을 먼저 확인하고, 필요한 하위 섹션만 저장하면 됩니다.
              </p>
            </div>
            <span className={styles.badge}>최고 관리자</span>
          </div>
          <nav className={styles.subNav} aria-label="AI 설정 하위 메뉴">
            <a href="#llm">모델 API</a>
            <a href="#mcp">도구 연결</a>
          </nav>
        </section>

        <section className={styles.section} id="llm">
          <div className={styles.sectionTitle}>
            <div>
              <h2>모델 API</h2>
              <p>
                자연어 질문 답변에 사용할 공급자, 모델명, API 주소를 설정해요.
                API Key는 암호화해 저장하고 다시 표시하지 않습니다.
              </p>
            </div>
          </div>
          <div className={styles.contentCard}>
            <AdminSettingsForm
              description={
                hasSetting(db, "llm_api_key")
                  ? "저장된 API Key가 있어요. 새 값을 입력하면 교체됩니다."
                  : "API Key가 없으면 질문 화면은 하네스 미리보기로 동작합니다."
              }
              fields={[
                {
                  key: "llm_provider",
                  label: "공급자",
                  placeholder: "OpenAI, Azure OpenAI 등",
                  value: getSetting(db, "llm_provider") ?? "OpenAI",
                },
                {
                  key: "llm_api_base_url",
                  label: "API Base URL",
                  placeholder: "https://api.openai.com/v1",
                  value: getSetting(db, "llm_api_base_url") ?? "",
                },
                {
                  key: "llm_model",
                  label: "모델",
                  placeholder: "gpt-5-mini",
                  value: getSetting(db, "llm_model") ?? "",
                },
                {
                  key: "llm_api_key",
                  label: "API Key",
                  placeholder: "새 키를 입력할 때만 저장",
                  secret: true,
                },
              ]}
              scope="llm"
            />
          </div>
        </section>

        <section className={styles.section} id="mcp">
          <div className={styles.sectionTitle}>
            <div>
              <h2>도구 연결</h2>
              <p>
                법령·판례·공공데이터 도구를 라우팅하기 위한 MCP 엔드포인트를
                관리해요. 리서치 하네스는 설정된 도구부터 우선 사용합니다.
              </p>
            </div>
          </div>
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
                  label: "Case Law API MCP",
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
