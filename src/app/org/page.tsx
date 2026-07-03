import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import {
  OrgCreateForm,
  OrgInviteForm,
  OrgMembersTable,
} from "@/components/org-manager";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { getUserOrganizations } from "@/lib/organizations";
import { getOrganizationSharedJudgments } from "@/lib/queries";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "조직 문서함",
  description: "조직에 공유된 문서와 구성원을 관리합니다.",
  robots: { index: false, follow: false },
});

export default async function OrganizationPage() {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    redirect("/login?next=/org&reason=login_required");
  }

  const organizations = getUserOrganizations(db, user.id);
  const sharedJudgments = getOrganizationSharedJudgments(db, user.id);
  const organizationIds = organizations.map((organization) => organization.id);
  const ownedOrganizations = organizations.filter(
    (organization) => organization.role === "owner",
  );
  const members =
    organizationIds.length === 0
      ? []
      : db
          .prepare<
            string[],
            {
              organization_id: string;
              organization_name: string;
              owner_user_id: string;
              user_id: string;
              email: string;
              role: string;
            }
          >(
            `SELECT organizations.id AS organization_id,
              organizations.name AS organization_name,
              organizations.owner_user_id,
              users.id AS user_id,
              users.email,
              organization_members.role
            FROM organization_members
            JOIN users ON users.id = organization_members.user_id
            JOIN organizations
              ON organizations.id = organization_members.organization_id
            WHERE organization_members.organization_id IN (${organizationIds
              .map(() => "?")
              .join(", ")})
            ORDER BY organization_members.created_at DESC`,
          )
          .all(...organizationIds);

  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>조직 문서함</h1>
              <p>
                내가 속한 조직에 공유된 문서를 확인해요. 내 비공개 문서는 문서
                화면의 조직 공유 설정에서 공유할 수 있어요.
              </p>
            </div>
            <span className={styles.badge}>
              내 조직 {organizations.length}개
            </span>
          </div>
          <div className={styles.orgCreateRow}>
            <OrgCreateForm />
          </div>
          {organizations.length === 0 ? (
            <p className={styles.notice}>
              아직 속한 조직이 없어요. 위에서 새 조직을 만들거나 조직 소유자에게
              초대를 요청해 주세요.
            </p>
          ) : (
            <div className={styles.judgmentList}>
              {organizations.map((organization) => (
                <div className={styles.judgmentListItem} key={organization.id}>
                  <div className={styles.judgmentListMain}>
                    <span className={styles.badge}>
                      {organization.role === "owner" ? "소유자" : "구성원"}
                    </span>
                    <strong>{organization.name}</strong>
                    <span>/{organization.slug}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>공유된 문서</h2>
              <p>조직 구성원이 함께 볼 수 있는 문서예요.</p>
            </div>
          </div>
          {sharedJudgments.length === 0 ? (
            <p className={styles.notice}>
              아직 조직에 공유된 문서가 없어요. 내 문서함에서 문서를 연 뒤 조직
              공유를 설정해 보세요.
            </p>
          ) : (
            <div className={styles.judgmentList}>
              {sharedJudgments.map((judgment) => (
                <article className={styles.judgmentListItem} key={judgment.id}>
                  <div className={styles.judgmentListMain}>
                    <span className={styles.badge}>
                      {judgment.organizationName}
                    </span>
                    <a href={`/cp/${encodeURIComponent(judgment.id)}`}>
                      {judgment.title}
                    </a>
                    <span>{judgment.caseNumber}</span>
                  </div>
                  <div className={styles.judgmentListMeta}>
                    <span>{judgment.sharedByEmail ?? "알 수 없음"}</span>
                    <span>
                      <LocalTime dateOnly dateTime={judgment.updatedAt} />
                    </span>
                  </div>
                  <div className={styles.judgmentListActions}>
                    <a
                      className={styles.secondaryButton}
                      href={`/cp/${encodeURIComponent(judgment.id)}`}
                    >
                      보기
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>구성원</h2>
              <p>
                조직 소유자는 이메일로 구성원을 초대하고 내보낼 수 있어요.
                초대된 이메일은 로그인만 하면 공유 문서를 볼 수 있습니다.
              </p>
            </div>
          </div>
          {ownedOrganizations.length > 0 && (
            <div className={styles.orgCreateRow}>
              <OrgInviteForm
                organizations={ownedOrganizations.map((organization) => ({
                  id: organization.id,
                  name: organization.name,
                }))}
              />
            </div>
          )}
          {members.length === 0 ? (
            <p className={styles.notice}>표시할 구성원이 없어요.</p>
          ) : (
            <OrgMembersTable
              canManageOrgIds={ownedOrganizations.map(
                (organization) => organization.id,
              )}
              members={members.map((member) => ({
                email: member.email,
                isOwner: member.user_id === member.owner_user_id,
                organizationId: member.organization_id,
                organizationName: member.organization_name,
                role: member.role,
                userId: member.user_id,
              }))}
            />
          )}
        </section>
      </main>
    </AppShell>
  );
}
