"use client";

import { useEffect, useRef } from "react";
import styles from "@/app/page.module.css";
import type { CitationEvidence } from "@/components/research-markdown";

export function CitationEvidenceModal({
  evidence,
  onClose,
}: {
  evidence: CitationEvidence;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const collectedDetailUrl = evidence.documentId
    ? `/p/${encodeURIComponent(evidence.documentId)}`
    : null;

  return (
    <div
      aria-labelledby="research-citation-title"
      aria-modal="true"
      className={styles.researchCitationBackdrop}
      role="dialog"
    >
      <button
        aria-label="근거 상세 바깥 영역 닫기"
        className={styles.researchCitationDismiss}
        onClick={onClose}
        type="button"
      />
      <article className={styles.researchCitationModal}>
        <header>
          <div className={styles.researchCitationBadges}>
            <span>{evidence.id}</span>
            {evidence.documentType && (
              <span>{documentTypeLabel(evidence.documentType)}</span>
            )}
          </div>
          <button
            aria-label="근거 상세 닫기"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>
        <h3 id="research-citation-title">{evidence.title}</h3>
        <small>
          {evidence.source} · 신뢰도 {evidence.confidence}
        </small>
        <section className={styles.researchCitationSummary}>
          <h4>답변에 사용한 내용</h4>
          <p>{evidence.summary}</p>
        </section>
        <div className={styles.researchCitationActions}>
          {collectedDetailUrl && (
            <a href={collectedDetailUrl}>수집 데이터 상세 보기</a>
          )}
          {evidence.url && (
            <a href={evidence.url} rel="noreferrer" target="_blank">
              원문 보기
            </a>
          )}
          {!collectedDetailUrl && !evidence.url && (
            <span className={styles.researchCitationUnavailable}>
              연결할 수 있는 상세 주소가 없습니다.
            </span>
          )}
        </div>
      </article>
    </div>
  );
}

function documentTypeLabel(documentType: string) {
  const labels: Record<string, string> = {
    administrative: "행정",
    civil: "민사",
    constitutional: "헌재결정",
    criminal: "형사",
    dictionary: "사전",
    family: "가사",
    law: "법령",
  };
  return labels[documentType] ?? documentType;
}
