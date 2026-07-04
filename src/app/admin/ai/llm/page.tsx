import { AdminAiSubnav } from "@/components/admin-ai-subnav";
import { ConnectionTestButton } from "@/components/connection-test-button";
import { LlmSettingsForm } from "@/components/llm-settings-form";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { DEFAULT_LLM_PRESET, detectLlmPreset } from "@/lib/llm-presets";
import { pageMetadata } from "@/lib/metadata";
import { getSetting, hasSetting } from "@/lib/settings";
import styles from "../../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "모델 API 설정",
  description:
    "AI 질문에 사용할 모델 공급자, API 주소, 모델명과 키를 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminAiLlmPage() {
  const db = getDatabase();
  const provider =
    getSetting(db, "llm_provider") ?? DEFAULT_LLM_PRESET.provider;
  const baseUrl =
    getSetting(db, "llm_api_base_url") ?? DEFAULT_LLM_PRESET.baseUrl;
  const model = getSetting(db, "llm_model") ?? DEFAULT_LLM_PRESET.model;

  return (
    <AppShell variant="admin" subNavigation={<AdminAiSubnav active="llm" />}>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>모델 API</h1>
              <p>
                자연어 질문 답변에 사용할 공급자, 모델명, API 주소를 설정해요.
                API Key는 암호화해 저장하고 관리자 화면에서 마스킹해 표시합니다.
              </p>
            </div>
            <span className={styles.badge}>AI 설정</span>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.contentCard}>
            <LlmSettingsForm
              description={
                hasSetting(db, "llm_api_key")
                  ? "저장된 API Key가 있어요. 새 값을 입력하면 교체됩니다."
                  : "API Key가 없으면 질문 화면은 하네스 미리보기로 동작합니다."
              }
              initialBaseUrl={baseUrl}
              initialApiKey={getSetting(db, "llm_api_key") ?? ""}
              initialModel={model}
              initialPreset={detectLlmPreset({ baseUrl, model, provider })}
              initialProvider={provider}
              initialTimeoutSeconds={
                getSetting(db, "llm_timeout_seconds") ?? ""
              }
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.contentCard}>
            <h2 className={styles.contentCardTitle}>연결 진단</h2>
            <p className={styles.contentCardDescription}>
              저장된 설정으로 실제 모델에 짧은 요청을 보내 인증, 모델명, 응답
              속도를 확인해요.
            </p>
            <ConnectionTestButton kind="llm" />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
