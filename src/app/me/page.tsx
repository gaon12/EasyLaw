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
  title: "내 문서함",
  description: "저장한 판결문, 생성 알림, 계정 설정을 확인합니다.",
  robots: { index: false, follow: false },
});

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
          <SearchableCardList
            emptyMessage="검색 조건에 맞는 계정이 없어요."
            rows={users.map((user) => {
              const badgeLabel = user.totp_enabled
                ? "2차 인증 사용 중"
                : "2차 인증 권장";
              const body = user.totp_required
                ? "관리 기능을 사용하려면 2차 인증이 필요해요."
                : "계정 설정에서 2차 인증과 복구 코드를 등록하면 더 안전해요.";
              return {
                badgeClassName: user.totp_enabled
                  ? styles.statusReady
                  : styles.statusPending,
                badgeLabel,
                body,
                id: user.id,
                meta: [user.email, user.role],
                searchText: `${user.display_name} ${user.email} ${user.role} ${badgeLabel}`,
                title: user.display_name,
              };
            })}
            searchLabel="계정 검색"
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>알림 구독</h2>
              <p>생성 완료 이메일은 판결문 생성 작업과 중복 없이 연결해요.</p>
            </div>
          </div>
          <SearchableTable
            columns={["이메일", "유형", "상태", "생성일"]}
            emptyMessage="검색 조건에 맞는 알림 구독이 없어요."
            rows={notifications.map((notice) => ({
              cells: [
                notice.email,
                notice.type,
                notice.status,
                { kind: "datetime", value: notice.created_at },
              ],
              id: `${notice.email}-${notice.created_at}`,
              searchText: `${notice.email} ${notice.type} ${notice.status} ${notice.created_at}`,
            }))}
            searchLabel="알림 검색"
          />
        </section>
      </main>
    </AppShell>
  );
}
