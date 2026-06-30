import { AppShell } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

type ForbiddenPageProps = {
  searchParams: Promise<{
    from?: string | string[];
    reason?: string | string[];
  }>;
};

export const metadata = pageMetadata({
  title: "권한 없음",
  description: "요청한 EasyLaw 페이지에 접근할 권한이 없습니다.",
  robots: { index: false, follow: false },
});

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function forbiddenMessage(reason: string | undefined) {
  if (reason === "admin_required") {
    return "관리센터는 최고 관리자 또는 운영 관리자 권한이 있는 계정만 열 수 있어요.";
  }
  return "이 페이지를 볼 권한이 없는 계정이에요. 필요한 권한이 맞는지 확인해 주세요.";
}

export default async function ForbiddenPage({
  searchParams,
}: ForbiddenPageProps) {
  const params = await searchParams;
  const from = firstParam(params.from);

  return (
    <AppShell>
      <main className={styles.authShell}>
        <section className={styles.authPanel}>
          <p className={styles.authNotice} role="alert">
            {forbiddenMessage(firstParam(params.reason))}
          </p>
          <h1>여긴 열쇠가 조금 더 필요해요</h1>
          <p>
            로그인은 되어 있지만 현재 계정에는 요청한 작업을 할 권한이 없습니다.
            조직 소유자나 서비스 최고 관리자에게 권한을 요청해 주세요.
          </p>
          {from && <p className={styles.mutedText}>요청한 경로: {from}</p>}
          <div className={styles.errorActions}>
            <a className={styles.primaryButton} href="/">
              홈으로 돌아가기
            </a>
            <a className={styles.secondaryButton} href="/me">
              내 계정 확인
            </a>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
