import { AppShell } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

export const metadata = pageMetadata({
  title: "개인정보처리방침",
  description:
    "EasyLaw가 개인정보와 비공개 판결문을 처리하는 기준을 안내합니다.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <AppShell>
      <main className={styles.main}>
        <article className={styles.noticeArticle}>
          <header>
            <span className={styles.badge}>정책</span>
            <h1>개인정보처리방침</h1>
            <p>
              EasyLaw는 판결문 이해를 돕는 데 필요한 정보만 수집하고, 사용자가
              붙여넣은 비공개 문서는 계정 접근 범위 안에서 관리합니다.
            </p>
          </header>
          <p>
            계정 이메일, 알림 수신 주소, 직접 저장한 문서 내용, 서비스 이용
            기록은 로그인, 알림, 문서 열람, 오류 확인 목적으로 사용합니다.
          </p>
          <p>
            LLM 또는 MCP 도구를 사용할 때는 질문과 근거 검색에 필요한 최소한의
            내용만 전달하도록 설계합니다. 외부 도구 연동 범위는 관리센터 설정에
            따릅니다.
          </p>
        </article>
      </main>
    </AppShell>
  );
}
