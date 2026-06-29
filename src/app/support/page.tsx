import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export default function SupportPage() {
  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>고객센터</h1>
              <p>
                판결문 검색, 생성 알림, 계정 보안, 조직 문서함 이용을 도와요.
              </p>
            </div>
          </div>
          <div className={styles.contentGrid}>
            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle}>자주 묻는 질문</h2>
              <div className={styles.listLinks}>
                <a className={styles.listLink} href="/catalog">
                  생성되지 않은 판결문도 알림을 받을 수 있나요?
                </a>
                <a className={styles.listLink} href="/security">
                  TOTP를 꼭 켜야 하나요?
                </a>
                <a className={styles.listLink} href="/org">
                  조직에서 결과를 공유할 수 있나요?
                </a>
              </div>
            </article>
            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle}>문의</h2>
              <p>
                Beta 기간에는 오류 신고와 문서 삭제 요청을 먼저 받을 예정이에요.
                민감한 개인정보가 들어간 문서는 공개 목록과 분리해 다뤄요.
              </p>
            </article>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
