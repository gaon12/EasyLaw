import type { ReactNode } from "react";
import { AdminDictionarySubnav } from "@/components/admin-dictionary-subnav";
import { LocalTime } from "@/components/local-time";
import { AppShell } from "@/components/site-chrome";
import styles from "../../page.module.css";

type DictionaryPageKey = "events" | "latest" | "legal" | "update";

export function DictionaryAdminPage({
  active,
  badge,
  children,
  description,
  title,
}: {
  active: DictionaryPageKey;
  badge: string;
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <AppShell
      variant="admin"
      subNavigation={<AdminDictionarySubnav active={active} />}
    >
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <span className={styles.badge}>{badge}</span>
          </div>
        </section>
        {children}
      </main>
    </AppShell>
  );
}

export function LatestDictionaryImport({
  latest,
}: {
  latest?: {
    completed_at: string | null;
    failure_reason: string | null;
    imported_count: number;
    status: string;
  };
}) {
  if (!latest) {
    return <p>아직 업데이트 이력이 없어요.</p>;
  }

  return (
    <div className={styles.securityMeta}>
      <div>
        <dt>상태</dt>
        <dd>{latestDictionaryStatus(latest)}</dd>
      </div>
      <div>
        <dt>완료 시각</dt>
        <dd>
          {latest.completed_at ? (
            <LocalTime dateTime={latest.completed_at} />
          ) : (
            "-"
          )}
        </dd>
      </div>
      <div>
        <dt>반영 결과</dt>
        <dd>{latestDictionaryResult(latest)}</dd>
      </div>
      {latest.failure_reason && (
        <div>
          <dt>오류</dt>
          <dd>{latest.failure_reason}</dd>
        </div>
      )}
    </div>
  );
}

export function dictionaryEventDisplay(input: {
  message: string | null;
  status: string;
}) {
  if (input.message === "사전 데이터 다운로드를 시작했습니다.") {
    return {
      message: "사전 데이터를 가져오기 시작했습니다.",
      status: input.status,
    };
  }
  if (input.status === "success" && input.message?.startsWith("0개 뜻풀이")) {
    return {
      message: "가져오기는 완료됐지만 새로 반영된 뜻풀이가 없습니다.",
      status: "skipped",
    };
  }
  return {
    message: input.message,
    status: input.status,
  };
}

function latestDictionaryStatus(input: {
  failure_reason: string | null;
  imported_count: number;
  status: string;
}) {
  if (input.failure_reason || input.status === "failed") {
    return "실패";
  }
  if (input.imported_count === 0) {
    return "완료 · 새 항목 없음";
  }
  return "완료";
}

function latestDictionaryResult(input: { imported_count: number }) {
  if (input.imported_count === 0) {
    return "가져오기는 끝났지만 새로 저장된 뜻풀이가 없습니다.";
  }
  return `${input.imported_count.toLocaleString("ko-KR")}개 뜻풀이를 저장했습니다.`;
}
