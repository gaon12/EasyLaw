import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { syncSampleExternalCatalog } from "@/lib/external-law";
import { getDashboardSnapshot, getManagementRows } from "@/lib/queries";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const db = getDatabase();
  await syncSampleExternalCatalog(db);
  const snapshot = getDashboardSnapshot(db);
  const rows = getManagementRows(db);

  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>운영 관리센터</h1>
              <p>
                사용자, 조직, 생성 큐, 외부 API 동기화, 실패 작업, 감사 로그를
                확인해요. 운영 관리자는 TOTP 등록이 필요해요.
              </p>
            </div>
            <span className={styles.badge}>TOTP 필수</span>
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
              <h2>사용자 보안 상태</h2>
              <p>
                관리자와 조직 소유자는 관리 기능 접근 전에 TOTP를 켜야 해요.
              </p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>이메일</th>
                  <th>역할</th>
                  <th>TOTP</th>
                  <th>필수 여부</th>
                </tr>
              </thead>
              <tbody>
                {rows.users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.totp_enabled ? "사용 중" : "미등록"}</td>
                    <td>{user.totp_required ? "필수" : "권장"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>판결문</th>
                  <th>작업 상태</th>
                  <th>시도</th>
                  <th>실패 사유</th>
                </tr>
              </thead>
              <tbody>
                {rows.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      {job.case_number}
                      <br />
                      {job.title}
                    </td>
                    <td>{job.status}</td>
                    <td>{job.attempts}</td>
                    <td>{job.failure_reason ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>감사 로그</h2>
              <p>TOTP 실패, 복구코드 사용, 작업 완료, 알림 발송을 남겨요.</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>시각</th>
                  <th>동작</th>
                  <th>대상</th>
                </tr>
              </thead>
              <tbody>
                {rows.auditLogs.map((log) => (
                  <tr key={`${log.action}-${log.created_at}`}>
                    <td>{log.created_at}</td>
                    <td>{log.action}</td>
                    <td>
                      {log.target_type}
                      {log.target_id ? ` / ${log.target_id}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
