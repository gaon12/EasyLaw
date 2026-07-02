import { cookies } from "next/headers";
import { SearchableBoardList } from "@/components/list-explorer";
import { AppShell } from "@/components/site-chrome";
import {
  listUserBookmarkRows,
  listUserPrivateJudgmentRows,
} from "@/lib/bookmarks";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "내 문서함",
  description: "북마크한 판결문과 내가 등록한 문서를 확인합니다.",
  robots: { index: false, follow: false },
});

export default async function MePage() {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);

  if (!user) {
    return (
      <AppShell>
        <main className={styles.main}>
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <div>
                <h1>내 문서함</h1>
                <p>
                  로그인하면 북마크한 판결문·법령과 직접 등록한 문서를 한곳에서
                  볼 수 있어요.
                </p>
              </div>
              <span className={styles.badge}>로그인 필요</span>
            </div>
            <a className={styles.primaryButton} href="/login?next=/me">
              로그인하고 문서함 보기
            </a>
          </section>
        </main>
      </AppShell>
    );
  }

  const bookmarks = listUserBookmarkRows(db, user.id);
  const privateDocuments = listUserPrivateJudgmentRows(db, user.id);

  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>내 문서함</h1>
              <p>
                {user.displayName}님이 저장한 판결문·법령과 직접 등록한 문서를
                모아 보여줘요.
              </p>
            </div>
            <a className={styles.infoButton} href="/catalog">
              판결문 찾아 북마크
            </a>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>북마크</h2>
              <p>다시 볼 판결문과 법령을 저장해두는 공간이에요.</p>
            </div>
          </div>
          <SearchableBoardList
            emptyMessage="아직 북마크한 항목이 없어요."
            rows={bookmarks}
            searchLabel="북마크 검색"
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>내가 등록한 문서</h2>
              <p>판결문 검색 화면에서 직접 붙여넣어 저장한 비공개 문서예요.</p>
            </div>
            <a
              className={styles.secondaryButton}
              href="/catalog#custom-judgment"
            >
              문서 등록하기
            </a>
          </div>
          <SearchableBoardList
            emptyMessage="아직 등록한 문서가 없어요."
            rows={privateDocuments}
            searchLabel="내 문서 검색"
          />
        </section>
      </main>
    </AppShell>
  );
}
