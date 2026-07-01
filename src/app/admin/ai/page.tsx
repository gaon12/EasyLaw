import Link from "next/link";
import { AdminAiSubnav } from "@/components/admin-ai-subnav";
import { AppShell } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "AI 설정",
  description: "AI 질문에 사용할 모델 API와 도구 연결을 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminAiPage() {
  return (
    <AppShell
      variant="admin"
      subNavigation={<AdminAiSubnav active="overview" />}
    >
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>AI 설정</h1>
              <p>
                질문 답변에 쓰는 모델 API와 외부 도구 연결을 나누어 관리해요.
                위쪽 하위 메뉴에서 필요한 설정 페이지로 이동할 수 있습니다.
              </p>
            </div>
            <span className={styles.badge}>최고 관리자</span>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.serviceCards}>
            <Link className={styles.miniCard} href="/admin/ai/llm">
              <strong>모델 API</strong>
              <span>
                공급자, 모델명, API 주소와 키를 설정합니다. 키는 저장 후 다시
                표시하지 않아요.
              </span>
            </Link>
            <Link className={styles.miniCard} href="/admin/ai/mcp">
              <strong>도구 연결</strong>
              <span>
                법령, 판례, 공공데이터 검색에 사용할 도구 엔드포인트와 호출 제한
                시간을 관리합니다.
              </span>
            </Link>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
