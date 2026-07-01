import styles from "@/app/page.module.css";
import { LocalTime } from "@/components/local-time";
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
              {judgment.caseNumber} · {judgment.courtName} · 선고일{" "}
              <LocalTime dateOnly dateTime={judgment.decidedOn} />
            </p>
          </div>
        </div>

        <article className={`${styles.resultBlock} ${styles.documentText}`}>
          <div className={styles.blockHeading}>
            <span className={styles.badge}>원문</span>
            <div>
              <h2>판결문 본문</h2>
              <p>
                쉬운 설명 생성 여부와 관계없이 확보된 판결문 본문을 먼저
                보여줘요.
              </p>
            </div>
          </div>
          {judgment.originalText ? (
            <p>{judgment.originalText}</p>
          ) : (
            <p>
              아직 본문을 가져오지 못했어요. 공개 출처가 제공되는 판결문은 아래
              원문 링크에서 바로 확인할 수 있어요.
            </p>
          )}
        </article>

        {analysis ? (
          <section className={styles.resultGrid} aria-labelledby="easy-title">
            <article className={styles.resultBlock}>
              <div className={styles.blockHeading}>
                <span className={styles.badge}>해설</span>
                <div>
                  <h2 id="easy-title">쉽게 말하면</h2>
                  <p>결론과 판단 이유를 일상적인 표현으로 나눠 읽어요.</p>
                </div>
              </div>
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
          </section>
        ) : (
          <div className={styles.notice}>
            쉬운 설명은 아직 준비 중이에요. 그동안 위의 본문과 공개 출처를
            기준으로 사건 내용을 먼저 확인할 수 있습니다.
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
