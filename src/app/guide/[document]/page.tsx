import { notFound } from "next/navigation";
import { AppShell } from "@/components/site-chrome";
import { getGuideDocument } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../page.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/guide/[document]">) {
  const { document: slug } = await params;
  const document = getGuideDocument(slug);

  if (!document) {
    return pageMetadata({
      title: "가이드를 찾을 수 없음",
      description: "요청한 EasyLaw 가이드 문서를 찾을 수 없습니다.",
      robots: { index: false, follow: false },
    });
  }

  return pageMetadata({
    title: document.title,
    description: document.summary,
    path: `/guide/${encodeURIComponent(document.slug)}`,
  });
}

export default async function GuideDocumentPage({
  params,
}: PageProps<"/guide/[document]">) {
  const { document: slug } = await params;
  const document = getGuideDocument(slug);
  if (!document) {
    notFound();
  }

  return (
    <AppShell>
      <main className={styles.main}>
        <div className={`${styles.section} ${styles.wikiDocumentLayout}`}>
          <aside className={styles.wikiDocumentAside}>
            <a href="/guide">← 위키 대문</a>
            <nav className={styles.wikiToc} aria-label="문서 목차">
              <strong>목차</strong>
              {document.sections.map((section, index) => (
                <a href={`#section-${index + 1}`} key={section.heading}>
                  {index + 1}. {section.heading}
                </a>
              ))}
            </nav>
            <div className={styles.wikiInfoBox}>
              <strong>문서 정보</strong>
              <span>최근 수정 {document.updatedOn}</span>
              <span>분류: EasyLaw 가이드</span>
            </div>
          </aside>

          <article className={styles.wikiArticle} id="top">
            <header className={styles.wikiArticleHeader}>
              <span className={styles.badge}>EasyLaw Wiki</span>
              <h1>{document.title}</h1>
              <p>{document.summary}</p>
              <div>
                <a href="/guide">위키 대문</a>
                <span>최근 수정 {document.updatedOn}</span>
              </div>
            </header>
            {document.sections.map((section, index) => (
              <section id={`section-${index + 1}`} key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                <a className={styles.wikiBacklink} href="#top">
                  맨 위로
                </a>
              </section>
            ))}
            <footer className={styles.wikiArticleFooter}>
              <strong>이 문서는 계속 다듬어지는 위키 문서입니다.</strong>
              <span>
                표현은 쉬워질 수 있지만 판결의 의미는 바뀌면 안 됩니다.
              </span>
            </footer>
          </article>
        </div>
      </main>
    </AppShell>
  );
}
