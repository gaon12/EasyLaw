import {
  SearchableCardList,
  SearchableTable,
} from "@/components/list-explorer";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "조직 문서함",
  description: "조직에서 공유한 판결문 결과와 구성원 상태를 관리합니다.",
  robots: { index: false, follow: false },
});

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
          <SearchableCardList
            emptyMessage="검색 조건에 맞는 조직이 없어요."
            rows={orgs.map((org) => {
              const ownerTotpStatus = org.owner_totp_enabled
                ? "등록됨"
                : "필수 등록 필요";
              return {
                badgeClassName: styles.statusPending,
                badgeLabel: "조직",
                body: `소유자 2차 인증: ${ownerTotpStatus}`,
                id: org.id,
                meta: [`/${org.slug}`, org.owner_email],
                searchText: `${org.name} ${org.slug} ${org.owner_email} ${ownerTotpStatus}`,
                title: org.name,
              };
            })}
            searchLabel="조직 검색"
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>구성원</h2>
              <p>조직 공유 결과와 초대, 보안 상태를 이 화면에서 확장해요.</p>
            </div>
          </div>
          <SearchableTable
            columns={["조직", "이메일", "역할", "2차 인증"]}
            emptyMessage="검색 조건에 맞는 구성원이 없어요."
            rows={members.map((member) => {
              const totpStatus = member.totp_enabled
                ? "사용 중"
                : "권장 또는 필수";
              return {
                cells: [
                  member.organization_name,
                  member.email,
                  member.role,
                  totpStatus,
                ],
                id: `${member.organization_name}-${member.email}`,
                searchText: `${member.organization_name} ${member.email} ${member.role} ${totpStatus}`,
              };
            })}
            searchLabel="구성원 검색"
          />
        </section>
      </main>
    </AppShell>
  );
}
