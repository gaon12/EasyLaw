import { getDatabase } from "@/lib/db";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export default function OrganizationPage() {
  const db = getDatabase();
  const orgs = db
    .prepare<
      [],
      {
        id: string;
        name: string;
        slug: string;
        owner_email: string;
        owner_totp_enabled: number;
      }
    >(
      `SELECT organizations.id,
        organizations.name,
        organizations.slug,
        users.email AS owner_email,
        users.totp_enabled AS owner_totp_enabled
      FROM organizations
      JOIN users ON users.id = organizations.owner_user_id
      ORDER BY organizations.created_at DESC`,
    )
    .all();

  const members = db
    .prepare<
      [],
      {
        organization_name: string;
        email: string;
        role: string;
        totp_enabled: number;
      }
    >(
      `SELECT organizations.name AS organization_name,
        users.email,
        organization_members.role,
        users.totp_enabled
      FROM organization_members
      JOIN users ON users.id = organization_members.user_id
      JOIN organizations ON organizations.id = organization_members.organization_id
      ORDER BY organization_members.created_at DESC`,
    )
    .all();

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <a className={styles.brand} href="/">
            <span className={styles.mark}>EL</span>
            <span>조직 페이지</span>
          </a>
          <nav className={styles.nav} aria-label="조직 페이지 이동">
            <a href="/">홈</a>
            <a href="/me">개인</a>
            <a href="/admin">운영 관리자</a>
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>조직 관리</h1>
              <p>
                조직 소유자와 멤버 구조로 시작합니다. 소유자는 TOTP 필수입니다.
              </p>
            </div>
            <span className={styles.badge}>Owner + Member</span>
          </div>
          <div className={styles.catalog}>
            {orgs.map((org) => (
              <article className={styles.judgmentCard} key={org.id}>
                <div>
                  <span className={styles.statusPending}>조직</span>
                  <h3>{org.name}</h3>
                  <div className={styles.meta}>
                    <span>/{org.slug}</span>
                    <span>{org.owner_email}</span>
                  </div>
                </div>
                <p className={styles.notice}>
                  소유자 TOTP:{" "}
                  {org.owner_totp_enabled ? "등록됨" : "필수 등록 필요"}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>구성원</h2>
              <p>조직 공유 결과, 초대, 사용량, 보안 상태의 시작점입니다.</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>조직</th>
                  <th>이메일</th>
                  <th>역할</th>
                  <th>TOTP</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={`${member.organization_name}-${member.email}`}>
                    <td>{member.organization_name}</td>
                    <td>{member.email}</td>
                    <td>{member.role}</td>
                    <td>
                      {member.totp_enabled ? "사용 중" : "권장/필수 확인"}
                    </td>
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
