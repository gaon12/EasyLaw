import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export default function SecurityPage() {
  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>보안 안내</h1>
              <p>
                이메일 매직링크로 시작하고, 중요한 계정은 TOTP와 복구코드로 한
                번 더 보호해요.
              </p>
            </div>
            <span className={styles.badge}>TOTP 권장</span>
          </div>
          <div className={styles.contentGrid}>
            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle}>일반 사용자</h2>
              <p>
                결과 저장, 알림 구독, 조직 가입을 사용할 때 TOTP 설정을
                권장해요. 복구코드는 한 번만 쓸 수 있게 보관해요.
              </p>
            </article>
            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle}>조직과 운영 관리</h2>
              <p>
                조직 소유자와 운영 관리자는 관리 화면에 들어가기 전에 TOTP를
                등록해야 해요. 실패와 복구코드 사용은 감사 로그에 남겨요.
              </p>
            </article>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
