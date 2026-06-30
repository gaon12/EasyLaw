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
          <div className={styles.boardList}>
            {notices.map((notice) => (
              <a href={`/notice/${notice.id}`} key={notice.id}>
                <span>{notice.id}</span>
                <strong>{notice.title}</strong>
                <time>{notice.publishedOn}</time>
              </a>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
