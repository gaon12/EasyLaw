import { LoginTotpForm } from "@/components/login-totp-form";
import { AppShell } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/metadata";
import { optionalSafeNextPath } from "@/lib/safe-next-path";
import styles from "../../page.module.css";

type LoginTotpPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export const metadata = pageMetadata({
  title: "2FA 인증",
  description: "인증 앱의 일회용 코드로 로그인을 완료하세요.",
  robots: { index: false, follow: false },
});

export default async function LoginTotpPage({
  searchParams,
}: LoginTotpPageProps) {
  const params = await searchParams;
  const nextPath = optionalSafeNextPath(
    Array.isArray(params.next) ? params.next[0] : params.next,
  );

  return (
    <AppShell>
      <main className={styles.authShell}>
        <section className={styles.authPanel}>
          <h1>2차 인증(2FA)</h1>
          <p>
            이메일 인증이 완료됐어요. 인증 앱에 표시된 6자리 코드를 입력하면
            로그인이 완료됩니다.
          </p>
          <LoginTotpForm nextPath={nextPath} />
        </section>
      </main>
    </AppShell>
  );
}
