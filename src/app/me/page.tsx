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
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <a className={styles.brand} href="/">
            <span className={styles.mark}>EL</span>
            <span>개인 페이지</span>
          </a>
          <nav className={styles.nav} aria-label="개인 페이지 이동">
            <a href="/">홈</a>
            <a href="/org">조직</a>
            <a href="/admin">운영 관리자</a>
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>내 계정과 분석 이력</h1>
              <p>
                일반 사용자는 TOTP를 선택할 수 있지만, 결과 저장과 조직 가입 시
                강하게 권장합니다.
              </p>
            </div>
            <span className={styles.badge}>Magic link + optional TOTP</span>
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
                    {user.totp_enabled ? "TOTP 사용 중" : "TOTP 권장"}
                  </span>
                  <h3>{user.display_name}</h3>
                  <div className={styles.meta}>
                    <span>{user.email}</span>
                    <span>{user.role}</span>
                  </div>
                </div>
                <p className={styles.notice}>
                  {user.totp_required
                    ? "이 계정은 관리 기능 때문에 TOTP가 필수입니다."
                    : "계정 설정에서 TOTP와 복구코드를 등록하도록 권장합니다."}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>알림 구독</h2>
              <p>
                생성 완료 이메일은 판결문 생성 작업과 idempotent하게 연결됩니다.
              </p>
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
    </div>
  );
}
