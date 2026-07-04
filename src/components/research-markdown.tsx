"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import styles from "@/app/page.module.css";
import { CitationEvidenceModal } from "@/components/citation-evidence-modal";

export type CitationEvidence = {
  id: string;
  documentId?: string;
  documentType?: string;
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
          rehypePlugins={[rehypeKatex]}
          remarkPlugins={[remarkGfm, remarkMath]}
        >
          {markdown}
        </ReactMarkdown>
      </div>

      {activeEvidence && (
        <CitationEvidenceModal
          evidence={activeEvidence}
          onClose={() => setActiveEvidence(null)}
        />
      )}
    </>
  );
}
