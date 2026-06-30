import { AppShell } from "@/components/site-chrome";
import { guideDocuments } from "@/lib/content";
import styles from "../page.module.css";

export default function GuidePage() {
  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>쉬운 판결문</h1>
              <p>누구나 함께 읽고 개선할 수 있는 위키형 도움말입니다.</p>
            </div>
          </div>
          <div className={styles.wikiList}>
            {guideDocuments.map((document) => (
              <a
                href={`/guide/${encodeURIComponent(document.slug)}`}
                key={document.slug}
              >
                <div>
                  <strong>{document.title}</strong>
                  <p>{document.summary}</p>
                </div>
                <time>{document.updatedOn}</time>
              </a>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
