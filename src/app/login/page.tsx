import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export default function LoginPage() {
  return (
    <AppShell>
      <main className={styles.authShell}>
        <section className={styles.authPanel}>
          <h1>로그인</h1>
          <p>
            이메일로 받은 매직링크로 로그인해요. TOTP를 켠 계정은 로그인 후 한
            번 더 확인해요.
          </p>
          <form className={styles.authForm}>
            <label className={styles.label} htmlFor="email">
              이메일
            </label>
            <input
              className={styles.input}
              id="email"
              placeholder="you@example.com"
              type="email"
            />
            <button className={styles.primaryButton} type="button">
              매직링크 받기
            </button>
            <a className={styles.secondaryButton} href="/signup">
              회원가입하기
            </a>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
