"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "@/app/page.module.css";

export type CitationEvidence = {
  id: string;
  source: string;
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  url?: string;
};

export function ResearchMarkdown({
  answer,
  evidence,
}: {
  answer: string;
  evidence: CitationEvidence[];
}) {
  const [activeEvidence, setActiveEvidence] = useState<CitationEvidence | null>(
    null,
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const evidenceById = useMemo(
    () => new Map(evidence.map((item) => [item.id, item])),
    [evidence],
  );
  const markdown = useMemo(
    () =>
      answer.replace(/\[(E\d+)\]/g, (citation, id: string) =>
        evidenceById.has(id) ? `[${id}](#evidence-${id})` : citation,
      ),
    [answer, evidenceById],
  );

  useEffect(() => {
    if (!activeEvidence) {
      return;
    }
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveEvidence(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeEvidence]);

  return (
    <>
      <div className={styles.researchMarkdown}>
        <ReactMarkdown
          components={{
            a({ children, href }) {
              const citationId = href?.match(/^#evidence-(E\d+)$/)?.[1];
              const citation = citationId
                ? evidenceById.get(citationId)
                : undefined;
              if (citation) {
                return (
                  <span className={styles.researchCitation}>
                    <button
                      aria-label={`${citation.id} 근거: ${citation.title}`}
                      onClick={() => setActiveEvidence(citation)}
                      type="button"
                    >
                      {citation.id.slice(1)}
                    </button>
                    <span role="tooltip">
                      <strong>{citation.title}</strong>
                      {citation.summary}
                    </span>
                  </span>
                );
              }
              return (
                <a href={href} rel="noreferrer" target="_blank">
                  {children}
                </a>
              );
            },
          }}
          remarkPlugins={[remarkGfm]}
        >
          {markdown}
        </ReactMarkdown>
      </div>

      {activeEvidence && (
        <div
          aria-labelledby="research-citation-title"
          aria-modal="true"
          className={styles.researchCitationBackdrop}
          role="dialog"
        >
          <button
            aria-label="근거 상세 바깥 영역 닫기"
            className={styles.researchCitationDismiss}
            onClick={() => setActiveEvidence(null)}
            type="button"
          />
          <article className={styles.researchCitationModal}>
            <header>
              <span>{activeEvidence.id}</span>
              <button
                aria-label="근거 상세 닫기"
                onClick={() => setActiveEvidence(null)}
                ref={closeButtonRef}
                type="button"
              >
                ×
              </button>
            </header>
            <h3 id="research-citation-title">{activeEvidence.title}</h3>
            <small>
              {activeEvidence.source} · 신뢰도 {activeEvidence.confidence}
            </small>
            <p>{activeEvidence.summary}</p>
            {activeEvidence.url ? (
              <a href={activeEvidence.url} rel="noreferrer" target="_blank">
                원문 보기
              </a>
            ) : (
              <span className={styles.researchCitationUnavailable}>
                연결할 수 있는 원문 주소가 없습니다.
              </span>
            )}
          </article>
        </div>
      )}
    </>
  );
}
