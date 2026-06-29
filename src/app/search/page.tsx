import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export default function SearchPage() {
  return (
    <AppShell>
      <main className={styles.authShell}>
        <section className={styles.authPanel}>
          <h1>통합검색</h1>
          <p>
            판결문, 쉬운말 가이드, 고객센터 문서를 함께 찾는 화면이에요. Beta
            단계에서는 공개 판결문 검색으로 연결해요.
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
