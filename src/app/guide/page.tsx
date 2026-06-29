import { AppShell } from "@/components/site-chrome";
import { sampleAnalysis } from "@/lib/easyread";
import styles from "../page.module.css";

export default function GuidePage() {
  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>쉬운 판결문</h1>
              <p>
                판결의 결론, 이유, 어려운 말, 주의할 점을 나눠 읽을 수 있게
                정리해요.
              </p>
            </div>
          </div>
          <div className={styles.resultGrid}>
            <article className={styles.resultBlock}>
              <h3>쉽게 말하면</h3>
              <ul>
                {sampleAnalysis.easyRead.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className={styles.resultBlock}>
              <h3>근거와 용어</h3>
              <p>{sampleAnalysis.summary}</p>
              <div className={styles.termList}>
                {sampleAnalysis.terms.map((term) => (
                  <div className={styles.termItem} key={term.term}>
                    <strong>{term.term}</strong>
                    <p>{term.explanation}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
