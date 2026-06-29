import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export default function MePage() {
  const db = getDatabase();
  const users = db
    .prepare<
      [],
      {
        id: string;
        email: string;
        display_name: string;
        role: string;
        totp_enabled: number;
        totp_required: number;
      }
    >(
      `SELECT id, email, display_name, role, totp_enabled, totp_required
        FROM users
        ORDER BY created_at DESC`,
    )
    .all();

  const notifications = db
    .prepare<
      [],
      {
        email: string;
        status: string;
        type: string;
        created_at: string;
      }
    >(
      `SELECT email, status, type, created_at
        FROM notifications
        ORDER BY created_at DESC
        LIMIT 10`,
    )
    .all();

  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>내 문서함</h1>
              <p>
                분석 이력, 저장 결과, 알림 구독, 삭제 요청, 2차 인증 설정을
                한곳에서 관리해요.
              </p>
            </div>
            <span className={styles.badge}>이메일 인증 + 2차 인증 권장</span>
          </div>
          <div className={styles.catalog}>
            {users.map((user) => (
              <article className={styles.judgmentCard} key={user.id}>
                <div>
                  <span
                    className={
                      user.totp_enabled
                        ? styles.statusReady
                        : styles.statusPending
                    }
                  >
                    {user.totp_enabled ? "2차 인증 사용 중" : "2차 인증 권장"}
                  </span>
                  <h3>{user.display_name}</h3>
                  <div className={styles.meta}>
                    <span>{user.email}</span>
                    <span>{user.role}</span>
                  </div>
                </div>
                <p className={styles.notice}>
                  {user.totp_required
                    ? "관리 기능을 사용하려면 2차 인증이 필요해요."
                    : "계정 설정에서 2차 인증과 복구 코드를 등록하면 더 안전해요."}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>알림 구독</h2>
              <p>생성 완료 이메일은 판결문 생성 작업과 중복 없이 연결해요.</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>이메일</th>
                  <th>유형</th>
                  <th>상태</th>
                  <th>생성일</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((notice) => (
                  <tr key={`${notice.email}-${notice.created_at}`}>
                    <td>{notice.email}</td>
                    <td>{notice.type}</td>
                    <td>{notice.status}</td>
                    <td>{notice.created_at}</td>
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
