import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export default function SignupPage() {
  return (
    <AppShell>
      <main className={styles.authShell}>
        <section className={styles.authPanel}>
          <h1>회원가입</h1>
          <p>
            이메일 인증으로 간편하게 시작해요. 가입 후 계정 보안 페이지에서
            필요에 따라 2차 인증을 설정할 수 있어요.
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
              이메일 인증하고 가입하기
            </button>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
