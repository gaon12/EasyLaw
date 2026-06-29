import { AppShell } from "@/components/site-chrome";
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
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>조직 문서함</h1>
              <p>
                조직 공유 결과, 구성원 초대, 사용량, 보안 상태를 함께 관리해요.
                조직 소유자는 2차 인증이 필요해요.
              </p>
            </div>
            <span className={styles.badge}>소유자 + 멤버</span>
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
                  소유자 2차 인증:{" "}
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
              <p>조직 공유 결과와 초대, 보안 상태를 이 화면에서 확장해요.</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>조직</th>
                  <th>이메일</th>
                  <th>역할</th>
                  <th>2차 인증</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={`${member.organization_name}-${member.email}`}>
                    <td>{member.organization_name}</td>
                    <td>{member.email}</td>
                    <td>{member.role}</td>
                    <td>
                      {member.totp_enabled ? "사용 중" : "권장 또는 필수"}
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
