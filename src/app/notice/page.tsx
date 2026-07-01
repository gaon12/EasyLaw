import { SearchableBoardList } from "@/components/list-explorer";
import { AppShell } from "@/components/site-chrome";
import { notices } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

export const metadata = pageMetadata({
  title: "공지사항",
  description: "EasyLaw 서비스 변경, URL 정책, 운영 안내를 확인하세요.",
  path: "/notice",
});

export default function NoticeListPage() {
  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>공지사항</h1>
              <p>EasyLaw의 새로운 소식과 운영 안내를 확인하세요.</p>
            </div>
          </div>
          <SearchableBoardList
            emptyMessage="검색 조건에 맞는 공지사항이 없어요."
            rows={notices.map((notice) => ({
              href: `/notice/${notice.id}`,
              id: notice.id,
              label: notice.id,
              meta: notice.publishedOn,
              searchText: `${notice.id} ${notice.title} ${notice.publishedOn}`,
              title: notice.title,
            }))}
            searchLabel="공지 검색"
          />
        </section>
      </main>
    </AppShell>
  );
}
