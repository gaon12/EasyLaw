import { SearchableBoardList } from "@/components/list-explorer";
import { AppShell } from "@/components/site-chrome";
import { notices } from "@/lib/content";
import { translate } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { getRequestLocale } from "@/lib/server-locale";
import styles from "../page.module.css";

export const metadata = pageMetadata({
  title: "공지사항",
  description: "EasyLaw 서비스 변경, URL 정책, 운영 안내를 확인하세요.",
  path: "/notice",
});

export default async function NoticeListPage() {
  const locale = await getRequestLocale();
  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1 data-i18n="notice.title">
                {translate(locale, "notice.title")}
              </h1>
              <p data-i18n="notice.description">
                {translate(locale, "notice.description")}
              </p>
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
