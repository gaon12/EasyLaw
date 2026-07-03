import { AdminAiSubnav } from "@/components/admin-ai-subnav";
import { AdminSettingsForm } from "@/components/admin-settings-form";
import { ConnectionTestButton } from "@/components/connection-test-button";
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
    <AppShell variant="admin" subNavigation={<AdminAiSubnav active="mcp" />}>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>도구 연결</h1>
              <p>
                법령과 판례 MCP 서버를 연결해요. LLM은 서버가 공개한 검색 도구를
                확인한 뒤 질문에 맞는 도구와 인자를 직접 선택합니다.
              </p>
            </div>
            <span className={styles.badge}>AI 설정</span>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.contentCard}>
            <AdminSettingsForm
              description="Streamable HTTP MCP 엔드포인트를 입력하세요. 검색 시 도구 목록을 새로 확인하며 쓰기·삭제 도구는 사용하지 않습니다."
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

        <section className={styles.section}>
          <div className={styles.contentCard}>
            <h2 className={styles.contentCardTitle}>연결 진단</h2>
            <p className={styles.contentCardDescription}>
              설정된 각 MCP 서버에 연결해 도구 목록과 실패 사유를 확인해요.
            </p>
            <ConnectionTestButton kind="mcp" />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.contentCard}>
            <h2 className={styles.contentCardTitle}>EasyLaw MCP 서버</h2>
            <p className={styles.contentCardDescription}>
              이 서비스가 수집한 공개 법률 코퍼스는 외부 MCP 클라이언트에도
              제공돼요. 아래 주소를 Streamable HTTP MCP 서버로 등록하면{" "}
              <code>search_legal_corpus</code>(전문 검색)와{" "}
              <code>get_legal_document</code>(원문 조회) 도구를 쓸 수 있어요.
              공개 데이터만 노출되고 IP당 시간당 300회로 제한됩니다.
            </p>
            <code className={styles.endpointCode}>/api/mcp</code>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
