import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export default function SearchPage() {
  return (
    <AppShell>
      <main className={styles.authShell}>
        <section className={styles.authPanel}>
          <h1>통합검색</h1>
          <p>
            지금은 자연어 질문은 AI 질문으로, 사건번호 검색은 판결문 검색으로
            분리해 운영해요. 검색 목적이 헷갈리지 않도록 이 화면은 판결문 검색에
            연결합니다.
          </p>
          <form action="/catalog" className={styles.authForm}>
            <label className={styles.label} htmlFor="site-search">
              검색어
            </label>
            <input
              className={styles.input}
              id="site-search"
              name="q"
              placeholder="사건번호, 법원명, 판결문 제목"
            />
            <button className={styles.primaryButton} type="submit">
              검색하기
            </button>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
