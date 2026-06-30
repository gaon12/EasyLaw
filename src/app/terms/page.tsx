import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export default function TermsPage() {
  return (
    <AppShell>
      <main className={styles.main}>
        <article className={styles.noticeArticle}>
          <header>
            <span className={styles.badge}>약관</span>
            <h1>이용약관</h1>
            <p>
              EasyLaw는 공개 판결문과 사용자가 제공한 문서를 쉬운 말로 이해할 수
              있도록 돕는 서비스입니다.
            </p>
          </header>
          <p>
            서비스가 제공하는 설명, 요약, 질문 답변은 법률 자문을 대체하지
            않습니다. 실제 신고, 소송, 합의, 계약처럼 권리관계에 영향을 주는
            결정은 전문가 확인이 필요합니다.
          </p>
          <p>
            사용자는 본인이 열람·처리할 권한이 있는 문서만 업로드해야 하며,
            타인의 개인정보나 민감정보를 입력할 때는 필요한 범위로 제한해야
            합니다.
          </p>
        </article>
      </main>
    </AppShell>
  );
}
