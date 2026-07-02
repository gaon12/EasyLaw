import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountSecurityCenter } from "@/components/account-security-center";
import { AppShell } from "@/components/site-chrome";
import { getAccountSecurityState } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { optionalSafeNextPath } from "@/lib/safe-next-path";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import styles from "../page.module.css";

type SecurityPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    reason?: string | string[];
  }>;
};

export const metadata = pageMetadata({
  title: "계정 보안 설정",
  description: "EasyLaw 계정의 로그인 확인, 2차 인증, 복구 코드를 관리합니다.",
  robots: { index: false, follow: false },
});

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SecurityPage({
  searchParams,
}: SecurityPageProps) {
  const params = await searchParams;
  const reason = firstParam(params.reason);
  const nextPath = optionalSafeNextPath(firstParam(params.next));
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);

  if (!user) {
    const loginParams = new URLSearchParams({
      next: "/security",
      reason: "login_required",
    });
    redirect(`/login?${loginParams.toString()}`);
  }

  const securityState = getAccountSecurityState(db, user.id);
  if (!securityState) {
    redirect("/login?reason=login_required");
  }

  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              {reason === "totp_required" && (
                <output className={styles.authNotice}>
                  관리 기능은 2차 인증을 켠 계정만 사용할 수 있어요. 아래에서
                  인증 앱을 등록한 뒤 이어서 이동할 수 있습니다.
                </output>
              )}
              <h1>계정 보안 설정</h1>
              <p>
                로그인 확인, 2차 인증, 복구 코드를 한곳에서 관리합니다. 현재
                계정 상태를 확인하고 필요한 보안 조치를 바로 실행할 수 있어요.
              </p>
            </div>
            <span className={styles.badge}>계정 설정</span>
          </div>
          <AccountSecurityCenter
            initialState={securityState}
            nextPath={nextPath}
          />
        </section>
      </main>
    </AppShell>
  );
}
