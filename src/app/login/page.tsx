import { AppShell } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

export const metadata = pageMetadata({
  title: "로그인",
  description: "EasyLaw 계정으로 로그인해 비공개 문서와 알림을 관리하세요.",
  robots: { index: false, follow: false },
});

export default function LoginPage() {
  return (
    <AppShell>
      <main className={styles.authShell}>
        <section className={styles.authPanel}>
          <h1>로그인</h1>
          <p>
            입력한 이메일로 인증 안내를 보내드려요. 2차 인증을 설정한 계정은
            로그인 과정에서 한 번 더 확인해요.
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
              이메일로 인증하기
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
