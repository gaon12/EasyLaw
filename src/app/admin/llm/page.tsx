import { AdminSettingsForm } from "@/components/admin-settings-form";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { getSetting, hasSetting } from "@/lib/settings";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "LLM API 설정",
  description: "AI 법률 질문에 사용할 LLM 공급자, 모델, API Key를 설정합니다.",
  robots: { index: false, follow: false },
});

export default function AdminLlmPage() {
  const db = getDatabase();

  return (
    <AppShell variant="admin">
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>LLM API 설정</h1>
              <p>
                자연어 질문 답변에 사용할 모델 공급자, 모델명, API 주소를
                관리해요. API Key는 암호화해 저장하고 다시 표시하지 않습니다.
              </p>
            </div>
            <span className={styles.badge}>최고 관리자</span>
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
      </main>
    </AppShell>
  );
}
