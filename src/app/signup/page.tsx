import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export default function SignupPage() {
  return (
    <AppShell>
      <main className={styles.authShell}>
        <section className={styles.authPanel}>
          <h1>회원가입</h1>
          <p>
            EasyLaw Beta는 이메일 계정으로 시작해요. 일반 사용자는 TOTP가 선택
            권장이고, 조직 소유자와 운영 관리자는 필수예요.
          </p>
          <form className={styles.authForm}>
            <label className={styles.label} htmlFor="signup-email">
              이메일
            </label>
            <input
              className={styles.input}
              id="signup-email"
              placeholder="you@example.com"
              type="email"
            />
            <label className={styles.label} htmlFor="signup-name">
              이름
            </label>
            <input
              className={styles.input}
              id="signup-name"
              placeholder="홍길동"
              type="text"
            />
            <button className={styles.primaryButton} type="button">
              가입 시작하기
            </button>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
