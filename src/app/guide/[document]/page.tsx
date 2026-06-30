import { notFound } from "next/navigation";
import { AppShell } from "@/components/site-chrome";
import { getGuideDocument } from "@/lib/content";
import styles from "../../page.module.css";

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
        <article className={`${styles.section} ${styles.wikiArticle}`}>
          <div className={styles.sectionTitle}>
            <div>
              <span className={styles.badge}>EasyLaw 가이드</span>
              <h1>{document.title}</h1>
              <p>{document.summary}</p>
            </div>
            <span className={styles.meta}>최근 수정 {document.updatedOn}</span>
          </div>
          <nav className={styles.wikiToc} aria-label="문서 목차">
            <strong>목차</strong>
            {document.sections.map((section, index) => (
              <a href={`#section-${index + 1}`} key={section.heading}>
                {index + 1}. {section.heading}
              </a>
            ))}
          </nav>
          {document.sections.map((section, index) => (
            <section id={`section-${index + 1}`} key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </article>
      </main>
    </AppShell>
  );
}
