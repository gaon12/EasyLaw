import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export default function SecurityPage() {
  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>계정 보호 설정</h1>
              <p>
                로그인 확인, 2차 인증, 복구 코드를 조용히 관리하는 곳이에요.
                과한 경고보다 필요한 선택지를 명확하게 보여줍니다.
              </p>
            </div>
            <span className={styles.badge}>계정 설정</span>
          </div>
          <div className={styles.contentGrid}>
            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle}>내 계정</h2>
              <p>
                내 문서와 알림을 쓰는 계정은 이메일 확인을 기본으로 사용해요.
                원하면 2차 인증과 복구 코드를 추가할 수 있습니다.
              </p>
            </article>
            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle}>조직과 관리 권한</h2>
              <p>
                조직 소유자와 관리 권한 계정은 문서 접근 범위가 넓기 때문에 2차
                인증을 사용합니다. 설정 상태는 관리센터에서 확인할 수 있어요.
              </p>
            </article>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
