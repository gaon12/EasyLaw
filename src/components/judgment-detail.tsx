import styles from "@/app/page.module.css";
import { JudgmentReaderTabs } from "@/components/judgment-reader-tabs";
import { LocalTime } from "@/components/local-time";
import { parseJudgmentDocument } from "@/lib/judgment-document";
import { displayJudgmentCaseType } from "@/lib/judgment-search";
import type { EasyReadAnalysis, JudgmentDetail } from "@/lib/types";

export function JudgmentDetailView({
  analysis,
  judgment,
  privateDocument = false,
  relatedJudgments = [],
}: {
  analysis: EasyReadAnalysis | null;
  judgment: JudgmentDetail;
  privateDocument?: boolean;
  relatedJudgments?: Array<{
    caseNumber: string;
    excerpt: string;
    href: string;
    label: string;
    title?: string;
  }>;
}) {
  const sourceAvailable = !privateDocument && Boolean(judgment.sourceUrl);
  const caseTypeLabel = displayJudgmentCaseType(judgment.caseType);
  const documentText =
    judgment.originalText ??
    judgment.sourceSummary ??
    fallbackJudgmentText(judgment, caseTypeLabel);
  const documentSections = documentText
    ? parseJudgmentDocument(documentText)
    : [];
  const hasOriginalText = Boolean(judgment.originalText);

  return (
    <main className={`${styles.main} ${styles.viewerMain}`}>
      <section className={styles.judgmentViewerHero}>
        <div>
          <span className={styles.badge}>
            {privateDocument ? "비공개 판결문" : "공개 판결문"}
          </span>
          <h1>{judgment.title}</h1>
          <p>
            {judgment.caseNumber} · {judgment.courtName} · 선고일{" "}
            <LocalTime dateOnly dateTime={judgment.decidedOn} />
          </p>
        </div>
      </section>

      <section className={styles.judgmentViewer} aria-label="판결문 상세 보기">
        <aside className={styles.viewerRail} aria-label="문서 탐색">
          <div className={styles.viewerRailPanel}>
            <strong className={styles.viewerRailTitle}>문서 목차</strong>
            <nav>
              <a href="#original-document">판결문</a>
              <a href="#easy-explanation">쉬운 판결문</a>
              {relatedJudgments.length > 0 && <a href="#related-cases">전심</a>}
              <a href="#judgment-info">판결 정보</a>
            </nav>
          </div>
          {documentSections.length > 0 && (
            <div
              className={`${styles.viewerRailPanel} ${styles.viewerSectionNav}`}
            >
              <strong>본문 구성</strong>
              {documentSections.slice(0, 8).map((section) => (
                <a href={`#${section.id}`} key={section.id}>
                  {section.title}
                </a>
              ))}
            </div>
          )}
          <dl className={`${styles.viewerRailPanel} ${styles.viewerMetaList}`}>
            <div>
              <dt>사건번호</dt>
              <dd>{judgment.caseNumber}</dd>
            </div>
            <div>
              <dt>법원</dt>
              <dd>{judgment.courtName}</dd>
            </div>
            <div>
              <dt>종류</dt>
              <dd>{caseTypeLabel}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>{analysis ? "쉬운 설명 있음" : "쉬운 설명 대기"}</dd>
            </div>
          </dl>
        </aside>

        <JudgmentReaderTabs
          documentPanel={
            <article
              aria-labelledby="original-document-heading"
              className={styles.viewerDocument}
              id="original-document"
              role="tabpanel"
            >
              <header className={styles.viewerPanelHeader}>
                <span className={styles.badge}>원문</span>
                <div>
                  <h2 id="original-document-heading">판결문 본문</h2>
                  <p>
                    {hasOriginalText
                      ? "쉬운 설명 생성 여부와 관계없이 확보된 판결문 본문을 먼저 보여줘요."
                      : "상세 본문을 아직 받지 못한 경우에도 공개 출처의 판결 요지를 먼저 보여줘요."}
                  </p>
                </div>
              </header>
              {documentSections.length > 0 ? (
                <div className={styles.viewerText}>
                  {!hasOriginalText && (
                    <div className={styles.viewerFallbackNotice}>
                      <strong>공개 출처의 판결 요지를 표시하고 있어요.</strong>
                      <p>
                        원문 전문은 출처에서 추가 확인할 수 있고, EasyLaw는
                        가능한 경우 자동으로 본문을 가져와 저장합니다.
                      </p>
                    </div>
                  )}
                  {documentSections.map((section) => (
                    <section
                      className={
                        section.kind === "order"
                          ? styles.judgmentDocumentOrder
                          : styles.judgmentDocumentSection
                      }
                      id={section.id}
                      key={section.id}
                    >
                      <h3>{section.title}</h3>
                      {section.blocks.length > 0 ? (
                        <div className={styles.judgmentParagraphs}>
                          {section.blocks.map((block, index) =>
                            block.kind === "heading" ? (
                              <DocumentHeading
                                key={`${section.id}-${index}`}
                                level={block.level}
                                text={block.text}
                              />
                            ) : (
                              <p
                                className={
                                  block.numbered
                                    ? styles.judgmentParagraphNumbered
                                    : styles.judgmentParagraph
                                }
                                key={`${section.id}-${index}`}
                              >
                                {block.text}
                              </p>
                            ),
                          )}
                        </div>
                      ) : (
                        <p className={styles.judgmentParagraph}>내용 없음</p>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <div className={styles.viewerEmpty}>
                  <strong>표시할 판결문 내용을 아직 확보하지 못했어요.</strong>
                  <p>
                    공개 출처가 제공되는 판결문은 원문 출처에서 바로 확인할 수
                    있어요. 기본 판결 정보와 전심 링크는 계속 볼 수 있습니다.
                  </p>
                  {sourceAvailable && (
                    <a
                      className={styles.secondaryButton}
                      href={judgment.sourceUrl ?? undefined}
                      rel="noreferrer"
                      target="_blank"
                    >
                      원문 출처 열기
                    </a>
                  )}
                </div>
              )}
            </article>
          }
          explanationPanel={
            <article
              aria-labelledby="easy-explanation-heading"
              className={styles.viewerInsight}
              id="easy-explanation"
              role="tabpanel"
            >
              <header className={styles.viewerPanelHeader}>
                <span className={styles.badge}>해설</span>
                <div>
                  <h2 id="easy-explanation-heading">쉬운 판결문</h2>
                  <p>생성된 해설이 있으면 핵심과 결론을 같이 보여줘요.</p>
                </div>
              </header>
              {analysis ? (
                <div className={styles.viewerInsightBody}>
                  <section>
                    <h3>쉽게 말하면</h3>
                    <p>{analysis.summary}</p>
                    <ul>
                      {analysis.easyRead.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h3>판결의 결론</h3>
                    <p>{analysis.finalResult}</p>
                  </section>
                </div>
              ) : (
                <div className={styles.viewerEmpty}>
                  <strong>쉬운 설명은 아직 준비 중이에요.</strong>
                  <p>
                    그래도 판결문 본문, 사건번호, 법원, 선고일, 공개 출처는 먼저
                    확인할 수 있습니다.
                  </p>
                </div>
              )}
            </article>
          }
        />

        {relatedJudgments.length > 0 && (
          <section className={styles.viewerRelated} id="related-cases">
            <header className={styles.viewerPanelHeader}>
              <span className={styles.badge}>전심</span>
              <div>
                <h2>함께 볼 판결문</h2>
                <p>
                  본문에서 확인한 원심·제1심 사건번호를 바로 이어 볼 수 있어요.
                </p>
              </div>
            </header>
            <div className={styles.relatedCaseList}>
              {relatedJudgments.map((related) => (
                <a href={related.href} key={related.caseNumber}>
                  <span>{related.label}</span>
                  <strong>{related.caseNumber}</strong>
                  <small>{related.title ?? related.excerpt}</small>
                </a>
              ))}
            </div>
          </section>
        )}

        <section className={styles.viewerInfo} id="judgment-info">
          <header className={styles.viewerPanelHeader}>
            <span className={styles.badge}>정보</span>
            <div>
              <h2>판결 정보</h2>
              <p>문서 확인에 필요한 기본 정보를 따로 모았어요.</p>
            </div>
          </header>
          <dl className={styles.viewerInfoGrid}>
            <div>
              <dt>사건번호</dt>
              <dd>{judgment.caseNumber}</dd>
            </div>
            <div>
              <dt>법원</dt>
              <dd>{judgment.courtName}</dd>
            </div>
            <div>
              <dt>선고일</dt>
              <dd>
                <LocalTime dateOnly dateTime={judgment.decidedOn} />
              </dd>
            </div>
            <div>
              <dt>종류</dt>
              <dd>{caseTypeLabel}</dd>
            </div>
            <div>
              <dt>공개 출처</dt>
              <dd>
                {sourceAvailable ? (
                  <a
                    href={judgment.sourceUrl ?? undefined}
                    rel="noreferrer"
                    target="_blank"
                  >
                    새 창에서 보기
                  </a>
                ) : (
                  "없음"
                )}
              </dd>
            </div>
          </dl>
        </section>
      </section>
    </main>
  );
}

function DocumentHeading({ level, text }: { level: 3 | 4 | 5; text: string }) {
  const className =
    level === 3
      ? styles.judgmentBlockHeading3
      : level === 4
        ? styles.judgmentBlockHeading4
        : styles.judgmentBlockHeading5;

  if (level === 3) {
    return <h4 className={className}>{text}</h4>;
  }
  if (level === 4) {
    return <h5 className={className}>{text}</h5>;
  }
  return <h6 className={className}>{text}</h6>;
}

function fallbackJudgmentText(judgment: JudgmentDetail, caseTypeLabel: string) {
  return [
    "판결 정보",
    `${judgment.courtName} ${judgment.decidedOn} 선고 ${judgment.caseNumber}`,
    `사건명: ${judgment.title}`,
    `사건 종류: ${caseTypeLabel}`,
  ].join("\n");
}
