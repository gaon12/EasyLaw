import { notFound } from "next/navigation";
import { AppShell } from "@/components/site-chrome";
import { getNotice } from "@/lib/content";
import styles from "../../page.module.css";

export default async function NoticePage({
  params,
}: PageProps<"/notice/[id]">) {
  const { id } = await params;
  const notice = getNotice(id);
  if (!notice) {
    notFound();
  }

  return (
    <AppShell>
      <main className={styles.main}>
        <article className={`${styles.section} ${styles.noticeArticle}`}>
          <header>
            <span className={styles.badge}>공지 {notice.id}</span>
            <h1>{notice.title}</h1>
            <time>{notice.publishedOn}</time>
          </header>
          {notice.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <a className={styles.secondaryButton} href="/notice">
            목록으로
          </a>
        </article>
      </main>
    </AppShell>
  );
}
