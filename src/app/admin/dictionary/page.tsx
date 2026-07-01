import { AdminDictionarySubnav } from "@/components/admin-dictionary-subnav";
import { DictionaryUpdateButton } from "@/components/dictionary-update-button";
import { LegalTermManager } from "@/components/legal-term-manager";
import { SearchableTable } from "@/components/list-explorer";
import { LocalTime } from "@/components/local-time";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import {
  latestDictionaryImport,
  listLegalDictionaryTerms,
} from "@/lib/dictionary";
import { listIntegrationEvents } from "@/lib/integration-events";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "용어 사전 관리",
  description: "법률 용어, 한국어기초사전, 표준국어대사전 데이터를 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminDictionaryPage() {
  const db = getDatabase();
  const latest = latestDictionaryImport(db);
  const legalTerms = listLegalDictionaryTerms(db);
  const events = listIntegrationEvents(db, "dictionary");

  return (
    <AppShell
      variant="admin"
      subNavigation={<AdminDictionarySubnav active="update" />}
    >
      <main className={styles.main}>
        <section className={styles.section} id="dictionary-update">
          <div className={styles.sectionTitle}>
            <div>
              <h1>용어 사전 관리</h1>
              <p>
                용어 설명은 자체 법률 용어 사전, 한국어기초사전, 표준국어대사전
                순서로 확인한 뒤 문맥 설명을 덧붙입니다.
              </p>
            </div>
            <span className={styles.badge}>우선순위 사전</span>
          </div>
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>공개 사전 데이터 업데이트</h2>
            <p>
              한국어기초사전은 GET ZIP, 표준국어대사전은 POST ZIP으로 받은 뒤
              JSON만 DB에 저장합니다. 반영이 끝나면 임시 파일은 삭제합니다.
            </p>
            <DictionaryUpdateButton />
          </div>
        </section>

        <section className={styles.section} id="legal-terms">
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>자체 법률 용어 사전</h2>
            <p>
              서비스가 반드시 먼저 보여줘야 하는 법률 용어 설명을 등록합니다.
              같은 단어가 여러 사전에 있어도 자체 설명이 1순위입니다.
            </p>
            <LegalTermManager initialTerms={legalTerms} />
          </div>
        </section>

        <section className={styles.section} id="dictionary-latest">
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>최근 업데이트</h2>
            {latest ? (
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
            ) : (
              <p>아직 업데이트 이력이 없어요.</p>
            )}
          </div>
        </section>

        <section className={styles.section} id="dictionary-events">
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>최근 작업 기록</h2>
            <SearchableTable
              columns={["시각", "동작", "상태", "메시지"]}
              emptyMessage="표시할 사전 작업 기록이 없어요."
              rows={events.map((event) => {
                const displayEvent = dictionaryEventDisplay(event);
                return {
                  cells: [
                    { kind: "datetime", value: event.createdAt },
                    event.action,
                    displayEvent.status,
                    displayEvent.message,
                  ],
                  id: `${event.createdAt}-${event.action}`,
                  searchText: `${event.createdAt} ${event.action} ${displayEvent.status} ${displayEvent.message ?? ""}`,
                };
              })}
              searchLabel="작업 기록 검색"
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
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
    return "다운로드는 끝났지만 새로 저장된 뜻풀이가 없습니다.";
  }
  return `${input.imported_count.toLocaleString("ko-KR")}개 뜻풀이를 저장했습니다.`;
}

function dictionaryEventDisplay(input: {
  message: string | null;
  status: string;
}) {
  if (input.status === "success" && input.message?.startsWith("0개 뜻풀이")) {
    return {
      message: "다운로드는 완료됐지만 새로 반영된 뜻풀이가 없습니다.",
      status: "skipped",
    };
  }
  return {
    message: input.message,
    status: input.status,
  };
}
