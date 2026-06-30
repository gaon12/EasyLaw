import { AuthEmailForm } from "@/components/auth-email-form";
import { AppShell } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    reason?: string | string[];
  }>;
};

export const metadata = pageMetadata({
  title: "로그인",
  description: "EasyLaw 계정으로 로그인해 비공개 문서와 알림을 관리하세요.",
  robots: { index: false, follow: false },
});

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function loginNotice(reason: string | undefined, nextPath: string | undefined) {
  if (reason === "invalid_link") {
    return "로그인 링크가 만료되었거나 이미 사용됐어요. 새 링크를 받아 주세요.";
  }
  if (reason === "totp_required") {
    return "이 계정은 2차 인증이 필요해요. 현재 화면에서는 이메일 확인까지만 완료했습니다.";
  }
  if (reason === "login_required" || nextPath) {
    return "로그인이 필요한 페이지예요. 먼저 이메일로 로그인하면 원래 보려던 곳으로 이어서 이동할 수 있어요.";
  }
  return "";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = firstParam(params.next);
  const notice = loginNotice(firstParam(params.reason), nextPath);

  return (
    <AppShell>
      <main className={styles.authShell}>
        <section className={styles.authPanel}>
          {notice && <output className={styles.authNotice}>{notice}</output>}
          <h1>로그인</h1>
          <p>
            입력한 이메일로 인증 안내를 보내드려요. 2차 인증을 설정한 계정은
            로그인 과정에서 한 번 더 확인해요.
          </p>
          <AuthEmailForm mode="login" nextPath={nextPath} />
        </section>
      </main>
    </AppShell>
  );
}
