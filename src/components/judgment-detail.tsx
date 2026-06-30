import styles from "@/app/page.module.css";
import type { EasyReadAnalysis, JudgmentDetail } from "@/lib/types";

export function JudgmentDetailView({
  analysis,
  judgment,
  privateDocument = false,
}: {
  analysis: EasyReadAnalysis | null;
  judgment: JudgmentDetail;
  privateDocument?: boolean;
}) {
  return (
    <main className={styles.main}>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <div>
            <span className={styles.badge}>
              {privateDocument ? "비공개 커스텀 판결문" : "공개 판결문"}
            </span>
            <h1>{judgment.title}</h1>
            <p>
              {judgment.caseNumber} · {judgment.courtName} ·{" "}
              {judgment.decidedOn}
            </p>
          </div>
        </div>

        {judgment.originalText && (
          <article className={`${styles.resultBlock} ${styles.documentText}`}>
            <h2>판결문 내용</h2>
            <p>{judgment.originalText}</p>
          </article>
        )}

        {analysis ? (
          <div className={styles.resultGrid}>
            <article className={styles.resultBlock}>
              <h2>쉽게 말하면</h2>
              <p>{analysis.summary}</p>
              <ul>
                {analysis.easyRead.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className={styles.resultBlock}>
              <h2>판결의 결론</h2>
              <p>{analysis.finalResult}</p>
            </article>
          </div>
        ) : (
          <div className={styles.notice}>
            쉬운 설명을 준비하고 있습니다. 판결문 기본 정보는 먼저 확인할 수
            있습니다.
          </div>
        )}

        {!privateDocument && judgment.sourceUrl && (
          <p className={styles.sourceLink}>
            <a href={judgment.sourceUrl} rel="noreferrer" target="_blank">
              공개 출처에서 원문 확인
            </a>
          </p>
        )}
      </section>
    </main>
  );
}
