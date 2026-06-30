import { notFound } from "next/navigation";
import { AppShell } from "@/components/site-chrome";
import { getNotice } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../page.module.css";

export async function generateMetadata({ params }: PageProps<"/notice/[id]">) {
  const { id } = await params;
  const notice = getNotice(id);

  if (!notice) {
    return pageMetadata({
      title: "공지를 찾을 수 없음",
      description: "요청한 공지사항을 찾을 수 없습니다.",
      robots: { index: false, follow: false },
    });
  }

  return pageMetadata({
    title: notice.title,
    description: notice.body[0],
    path: `/notice/${notice.id}`,
  });
}

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
