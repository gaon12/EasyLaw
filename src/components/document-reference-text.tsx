"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { XIcon } from "@/components/icons";
import type { DocumentReferenceLink } from "@/lib/document-references";

export function DocumentReferenceText({
  references,
  text,
}: {
  references: DocumentReferenceLink[];
  text: string;
}) {
  const [selectedReference, setSelectedReference] =
    useState<DocumentReferenceLink | null>(null);
  const parts = useMemo(
    () => splitReferenceText(text, references),
    [references, text],
  );

  if (parts.length === 1 && parts[0].kind === "text") {
    return text;
  }

  return (
    <>
      {parts.map((part, index) =>
        part.kind === "text" ? (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ) : (
          <button
            className={styles.documentReferenceButton}
            key={`${part.reference.id}-${part.text}-${index}`}
            onClick={() => setSelectedReference(part.reference)}
            title={`${referenceKindLabel(part.reference.kind)} 정보 보기`}
            type="button"
          >
            {part.text}
          </button>
        ),
      )}
      {selectedReference && (
        <DocumentReferenceModal
          onClose={() => setSelectedReference(null)}
          reference={selectedReference}
        />
      )}
    </>
  );
}

type ReferenceTextPart =
  | { kind: "text"; text: string }
  | { kind: "reference"; reference: DocumentReferenceLink; text: string };

function splitReferenceText(
  text: string,
  references: DocumentReferenceLink[],
): ReferenceTextPart[] {
  const uniqueReferences = uniqueReferencesForText(text, references);
  if (uniqueReferences.length === 0) {
    return [{ kind: "text", text }];
  }

  const pattern = new RegExp(
    uniqueReferences
      .flatMap(referenceMatchTexts)
      .sort((left, right) => right.length - left.length)
      .map(escapeRegExp)
      .join("|"),
    "g",
  );
  const parts: ReferenceTextPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push({ kind: "text", text: text.slice(lastIndex, matchIndex) });
    }
    const reference = uniqueReferences.find((item) =>
      referenceMatchTexts(item).includes(matchedText),
    );
    if (reference) {
      parts.push({ kind: "reference", reference, text: matchedText });
    } else {
      parts.push({ kind: "text", text: matchedText });
    }
    lastIndex = matchIndex + matchedText.length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return parts;
}

function uniqueReferencesForText(
  text: string,
  references: DocumentReferenceLink[],
) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const matchesText = referenceMatchTexts(reference).some((matchText) =>
      text.includes(matchText),
    );
    if (!matchesText || seen.has(reference.id)) {
      return false;
    }
    seen.add(reference.id);
    return true;
  });
}

function referenceMatchTexts(reference: DocumentReferenceLink) {
  if (reference.kind === "case") {
    return [reference.lookupText];
  }
  return [
    reference.lookupText,
    `구 ${reference.lookupText}`,
    `「${reference.lookupText}」`,
    `「구 ${reference.lookupText}」`,
  ];
}

function DocumentReferenceModal({
  onClose,
  reference,
}: {
  onClose: () => void;
  reference: DocumentReferenceLink;
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

  return (
    <div
      aria-labelledby="document-reference-title"
      aria-modal="true"
      className={styles.documentReferenceBackdrop}
      role="dialog"
    >
      <button
        aria-label="문서 정보 바깥 영역 닫기"
        className={styles.documentReferenceDismiss}
        onClick={onClose}
        type="button"
      />
      <article className={styles.documentReferenceModal}>
        <header>
          <div>
            <span>{referenceKindLabel(reference.kind)}</span>
            {reference.caseNumber && <span>{reference.caseNumber}</span>}
          </div>
          <button
            aria-label="문서 정보 닫기"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <XIcon size={18} />
          </button>
        </header>
        <h3 id="document-reference-title">{reference.title}</h3>
        <dl>
          <div>
            <dt>{reference.kind === "law" ? "출처" : "법원"}</dt>
            <dd>{reference.source}</dd>
          </div>
          <div>
            <dt>{reference.kind === "law" ? "기준일" : "선고일"}</dt>
            <dd>{reference.dateLabel}</dd>
          </div>
        </dl>
        {reference.summary && <p>{reference.summary}</p>}
        <a href={reference.detailHref} rel="noreferrer" target="_blank">
          상세보기
        </a>
      </article>
    </div>
  );
}

function referenceKindLabel(kind: DocumentReferenceLink["kind"]) {
  return kind === "law" ? "법령" : "판례";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
