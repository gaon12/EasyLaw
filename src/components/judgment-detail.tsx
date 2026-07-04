import styles from "@/app/page.module.css";
import { BookmarkButton } from "@/components/bookmark-button";
import { CheckIcon } from "@/components/icons";
import { JudgmentReaderTabs } from "@/components/judgment-reader-tabs";
import { LocalTime } from "@/components/local-time";
import { parseJudgmentDocument } from "@/lib/judgment-document";
import { displayJudgmentCaseType } from "@/lib/judgment-search";
import type { EasyReadAnalysis, JudgmentDetail } from "@/lib/types";

export function JudgmentDetailView({
  analysis,
  bookmarkInitialActive = false,
  judgment,
  privateDocument = false,
  relatedJudgments = [],
}: {
  analysis: EasyReadAnalysis | null;
  bookmarkInitialActive?: boolean;
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
  const caseTypeLabel = displayJudgmentCaseType(judgment.caseType);
  const isLegalDocument = judgment.caseType === "law";
  const documentLabel = isLegalDocument ? "법령" : "판결문";
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
            {privateDocument
              ? `비공개 ${documentLabel}`
              : `공개 ${documentLabel}`}
          </span>
          <h1>{judgment.title}</h1>
          <p>
            {judgment.caseNumber} · {judgment.courtName} · 선고일{" "}
            <LocalTime dateOnly dateTime={judgment.decidedOn} />
          </p>
        </div>
        <div className={styles.viewerHeroActions}>
          <BookmarkButton
            initialActive={bookmarkInitialActive}
            judgmentId={judgment.id}
          />
        </div>
      </section>

      <section
        className={styles.judgmentViewer}
        aria-label={`${documentLabel} 상세 보기`}
      >
        <aside className={styles.viewerRail} aria-label="문서 탐색">
          <div className={styles.viewerRailPanel}>
            <strong className={styles.viewerRailTitle}>문서 목차</strong>
            <nav>
              <a href="#original-document">원문</a>
              <a href="#easy-explanation">쉬운 해설</a>
              <a href="#easy-read">이지리드</a>
              {relatedJudgments.length > 0 && <a href="#related-cases">전심</a>}
              <a href="#judgment-info">문서 정보</a>
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
              <dd>{analysis ? "쉬운 해설 있음" : "쉬운 해설 대기"}</dd>
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
                  <h2 id="original-document-heading">{documentLabel} 본문</h2>
                  <p>
                    {hasOriginalText
                      ? `쉬운 설명 생성 여부와 관계없이 확보된 ${documentLabel} 본문을 먼저 보여줘요.`
                      : `상세 본문을 아직 받지 못한 경우에는 확보된 ${documentLabel} 요지를 먼저 보여줘요.`}
                  </p>
                </div>
              </header>
              {documentSections.length > 0 ? (
                <div className={styles.viewerText}>
                  {!hasOriginalText && (
                    <div className={styles.viewerFallbackNotice}>
                      <strong>{documentLabel} 요지를 표시하고 있어요.</strong>
                      <p>
                        EasyLaw는 가능한 경우 자동으로 상세 본문을 가져와
                        저장합니다.
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
                  <strong>
                    표시할 {documentLabel} 내용을 아직 확보하지 못했어요.
                  </strong>
                  <p>기본 판결 정보와 전심 링크는 계속 볼 수 있습니다.</p>
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
                <span className={styles.badge}>쉬운 해설</span>
                <div>
                  <h2 id="easy-explanation-heading">쉬운 해설</h2>
                  <p>
                    원문을 보지 않아도 결론과 이유, 해야 할 일을 이해할 수
                    있도록 정리했어요.
                  </p>
                </div>
              </header>
              {analysis ? (
                <ExplanationBody analysis={analysis} />
              ) : (
                <div className={styles.viewerEmpty}>
                  <strong>쉬운 해설은 아직 준비 중이에요.</strong>
                  <p>
                    그래도 {documentLabel} 본문과 기본 정보는 먼저 확인할 수
                    있습니다.
                  </p>
                </div>
              )}
            </article>
          }
          easyReadPanel={
            <article
              aria-labelledby="easy-read-heading"
              className={styles.viewerInsight}
              id="easy-read"
              role="tabpanel"
            >
              <header className={styles.viewerPanelHeader}>
                <span className={styles.badge}>이지 리드</span>
                <div>
                  <h2 id="easy-read-heading">이지리드</h2>
                  <p>
                    꼭 알아야 할 결론과 해야 할 일만 큰 글씨로 짧게 보여줘요.
                  </p>
                </div>
              </header>
              {analysis ? (
                <EasyReadBody analysis={analysis} />
              ) : (
                <div className={styles.viewerEmpty}>
                  <strong>이지 리드는 아직 준비 중이에요.</strong>
                  <p>
                    그래도 {documentLabel} 본문과 기본 정보는 먼저 확인할 수
                    있습니다.
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
              <h2>{documentLabel} 정보</h2>
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
          </dl>
        </section>
      </section>
    </main>
  );
}

function ExplanationBody({ analysis }: { analysis: EasyReadAnalysis }) {
  const verdict = analysis.verdict;
  const verdictDetails = verdict
    ? ([
        ["해야 할 일", verdict.obligations],
        ["돈", verdict.amounts],
        ["기간·기한", verdict.deadlines],
        ["항소·불복", verdict.appeal ? [verdict.appeal] : []],
      ] as const)
    : [];

  return (
    <div className={styles.viewerInsightBody}>
      <section>
        <h3>쉽게 말하면</h3>
        <p>{analysis.summary}</p>
      </section>
      <section className={styles.verdictCard}>
        <h3>결론</h3>
        <p className={styles.verdictOutcome}>
          {verdict?.outcome ?? analysis.finalResult}
        </p>
        {verdictDetails.some(([, items]) => items.length > 0) && (
          <dl className={styles.verdictGrid}>
            {verdictDetails.map(
              ([label, items]) =>
                items.length > 0 && (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      <ul>
                        {items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ),
            )}
          </dl>
        )}
      </section>
      {analysis.timeline.length > 0 && (
        <section>
          <h3>사건의 흐름</h3>
          <ol>
            {analysis.timeline.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      )}
      {analysis.claims.length > 0 && (
        <section>
          <h3>각자의 주장</h3>
          <ul>
            {analysis.claims.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {analysis.courtReasoning.length > 0 && (
        <section>
          <h3>왜 그렇게 판단했나요?</h3>
          <ul>
            {analysis.courtReasoning.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3>자세한 풀이</h3>
        <ul>
          {analysis.easyRead.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      {analysis.terms.length > 0 && (
        <section>
          <h3>용어 풀이</h3>
          <dl className={styles.explainTerms}>
            {analysis.terms.map((term) => (
              <div key={term.term}>
                <dt>{term.term}</dt>
                <dd>{term.explanation}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {analysis.sourceGrounds.length > 0 && (
        <section>
          <h3>원문 근거</h3>
          <div className={styles.sourceGroundList}>
            {analysis.sourceGrounds.map((ground) => (
              <blockquote key={`${ground.label}-${ground.excerpt}`}>
                <span>{ground.label}</span>
                <p>{ground.excerpt}</p>
              </blockquote>
            ))}
          </div>
        </section>
      )}
      {analysis.unknowns.length > 0 && (
        <section>
          <h3>이 문서만으로 알 수 없는 것</h3>
          <ul>
            {analysis.unknowns.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {analysis.warnings.length > 0 && (
        <section>
          <h3>주의할 점</h3>
          <ul>
            {analysis.warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EasyReadBody({ analysis }: { analysis: EasyReadAnalysis }) {
  const headline = analysis.accessible?.headline ?? analysis.finalResult;
  const keyPoints = analysis.accessible?.keyPoints.length
    ? analysis.accessible.keyPoints
    : analysis.easyRead.slice(0, 3);
  const todos = analysis.accessible?.todos ?? [];

  return (
    <div className={styles.ezReadBody}>
      <p className={styles.ezReadHeadline}>{headline}</p>
      <section className={styles.ezReadSection}>
        <h3>꼭 알아야 해요</h3>
        <ol className={styles.ezReadPoints}>
          {keyPoints.map((point, index) => (
            <li key={point}>
              <span aria-hidden className={styles.ezReadNumber}>
                {index + 1}
              </span>
              {point}
            </li>
          ))}
        </ol>
      </section>
      {todos.length > 0 && (
        <section className={styles.ezReadSection}>
          <h3>해야 할 일</h3>
          <ul className={styles.ezReadTodos}>
            {todos.map((todo) => (
              <li key={todo}>
                <span aria-hidden className={styles.ezReadCheck}>
                  <CheckIcon size={18} />
                </span>
                {todo}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className={styles.ezReadFootnote}>
        이 화면은 핵심만 짧게 보여줘요. 더 자세한 내용은{" "}
        <a href="#easy-explanation">쉬운 해설</a>에서 볼 수 있어요.
      </p>
    </div>
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
