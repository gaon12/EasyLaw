import { AdminJudgmentCollectionPanel } from "@/components/admin-judgment-collection-panel";
import { SearchableTable } from "@/components/list-explorer";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { syncExternalCatalog } from "@/lib/external-law";
import {
  getJudgmentCollectionStatus,
  listJudgmentCollectionRuns,
} from "@/lib/judgment-collection";
import { pageMetadata } from "@/lib/metadata";
import { getDashboardSnapshot, getManagementRows } from "@/lib/queries";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "운영 관리센터",
  description: "EasyLaw 운영 상태, 생성 큐, 사용자 보안 상태를 관리합니다.",
  robots: { index: false, follow: false },
});

export default async function AdminPage() {
  const db = getDatabase();
  await syncExternalCatalog(db);
  const snapshot = getDashboardSnapshot(db);
  const rows = getManagementRows(db);
  const collectionStatus = getJudgmentCollectionStatus(db);
  const collectionRuns = listJudgmentCollectionRuns(db);

  return (
    <AppShell variant="admin">
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>운영 관리센터</h1>
              <p>
                사용자, 조직, 생성 큐, 정보 동기화, 실패 작업, 감사 로그를
                확인해요. 운영 관리자는 2차 인증 설정이 필요해요.
              </p>
            </div>
            <span className={styles.badge}>2차 인증 필수</span>
          </div>
          <div className={styles.adminGrid}>
            <div className={styles.metric}>
              <strong>{snapshot.userCount}</strong>
              <span>사용자</span>
            </div>
            <div className={styles.metric}>
              <strong>{snapshot.organizationCount}</strong>
              <span>조직</span>
            </div>
            <div className={styles.metric}>
              <strong>{snapshot.queuedJobCount}</strong>
              <span>생성 대기</span>
            </div>
            <div className={styles.metric}>
              <strong>{snapshot.failedJobCount}</strong>
              <span>실패 작업</span>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>판결문 자동 수집</h2>
              <p>
                공개 판결문 검색어와 주기를 관리하고, 필요할 때 즉시 수집을
                시작해요.
              </p>
            </div>
            <span className={styles.badge}>Open Law</span>
          </div>
          <AdminJudgmentCollectionPanel status={collectionStatus} />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>수집 실행 이력</h2>
              <p>자동 실행과 수동 실행 결과를 함께 확인해요.</p>
            </div>
          </div>
          <SearchableTable
            columns={["시각", "실행", "상태", "결과", "실패 사유"]}
            emptyMessage="아직 판결문 수집 실행 이력이 없어요."
            rows={collectionRuns.map((run) => {
              const result = `${run.importedCount}건 / 신규 ${run.createdCount} / 갱신 ${run.updatedCount}`;
              return {
                cells: [
                  { kind: "datetime", value: run.startedAt },
                  run.trigger === "manual" ? "수동" : "자동",
                  run.status,
                  { kind: "lines", lines: [run.query, result] },
                  run.failureReason,
                ],
                id: run.id,
                searchText: `${run.startedAt} ${run.trigger} ${run.status} ${run.query} ${result} ${run.failureReason ?? ""}`,
              };
            })}
            searchLabel="수집 이력 검색"
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>사용자 보안 상태</h2>
              <p>
                관리자와 조직 소유자는 관리 기능을 사용하기 전에 2차 인증을
                설정해야 해요.
              </p>
            </div>
          </div>
          <SearchableTable
            columns={["이메일", "역할", "2차 인증", "필수 여부"]}
            emptyMessage="검색 조건에 맞는 사용자가 없어요."
            rows={rows.users.map((user) => {
              const totpStatus = user.totp_enabled ? "사용 중" : "미등록";
              const requiredStatus = user.totp_required ? "필수" : "권장";
              return {
                cells: [user.email, user.role, totpStatus, requiredStatus],
                id: user.id,
                searchText: `${user.email} ${user.role} ${totpStatus} ${requiredStatus}`,
              };
            })}
            searchLabel="사용자 검색"
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>생성 큐</h2>
              <p>
                아직 생성되지 않은 판결문도 목록에 남기고, 완료되면 신청자에게
                알림을 보내요.
              </p>
            </div>
          </div>
          <SearchableTable
            columns={["판결문", "작업 상태", "시도", "실패 사유"]}
            emptyMessage="검색 조건에 맞는 생성 작업이 없어요."
            rows={rows.jobs.map((job) => ({
              cells: [
                { kind: "lines", lines: [job.case_number, job.title] },
                job.status,
                job.attempts,
                job.failure_reason,
              ],
              id: job.id,
              searchText: `${job.case_number} ${job.title} ${job.status} ${job.failure_reason ?? ""}`,
            }))}
            searchLabel="생성 큐 검색"
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>감사 로그</h2>
              <p>
                2차 인증 실패, 복구 코드 사용, 작업 완료, 알림 발송을 남겨요.
              </p>
            </div>
          </div>
          <SearchableTable
            columns={["시각", "동작", "대상"]}
            emptyMessage="검색 조건에 맞는 감사 로그가 없어요."
            rows={rows.auditLogs.map((log, index) => {
              const target = `${log.target_type}${log.target_id ? ` / ${log.target_id}` : ""}`;
              return {
                cells: [
                  { kind: "datetime", value: log.created_at },
                  log.action,
                  target,
                ],
                id: `${log.created_at}-${log.action}-${index}`,
                searchText: `${log.created_at} ${log.action} ${target}`,
              };
            })}
            searchLabel="감사 로그 검색"
          />
        </section>
      </main>
    </AppShell>
  );
}
