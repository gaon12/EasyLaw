import type { SqliteDatabase } from "@/lib/db";
import type {
  DocumentReferenceCandidate,
  DocumentReferenceLink,
} from "@/lib/document-references";
import {
  getPublicJudgmentsByCaseNumbers,
  getPublicLawJudgmentsByTitles,
} from "@/lib/queries";

export function buildDocumentReferenceLinks(
  db: SqliteDatabase,
  candidates: DocumentReferenceCandidate[],
): DocumentReferenceLink[] {
  if (candidates.length === 0) {
    return [];
  }

  const caseJudgments = new Map(
    getPublicJudgmentsByCaseNumbers(
      db,
      candidates
        .filter((candidate) => candidate.kind === "case")
        .map((candidate) => candidate.lookupText),
    ).map((judgment) => [judgment.caseNumber, judgment]),
  );
  const lawJudgments = new Map(
    getPublicLawJudgmentsByTitles(
      db,
      candidates
        .filter((candidate) => candidate.kind === "law")
        .map((candidate) => candidate.lookupText),
    ).map((judgment) => [judgment.title, judgment]),
  );

  return candidates.map((candidate) => {
    const matchedJudgment =
      candidate.kind === "case"
        ? caseJudgments.get(candidate.lookupText)
        : lawJudgments.get(candidate.lookupText);
    return {
      caseNumber:
        candidate.kind === "case"
          ? candidate.lookupText
          : (matchedJudgment?.caseNumber ?? null),
      dateLabel: matchedJudgment?.decidedOn ?? "검색으로 확인",
      detailHref: matchedJudgment
        ? `/p/${encodeURIComponent(matchedJudgment.id)}`
        : `/catalog?q=${encodeURIComponent(candidate.lookupText)}`,
      id: `${candidate.kind}:${candidate.lookupText}`,
      kind: candidate.kind,
      lookupText: candidate.lookupText,
      source:
        matchedJudgment?.courtName ??
        (candidate.kind === "law" ? "EasyLaw 법령 검색" : "EasyLaw 판례 검색"),
      summary: matchedJudgment?.sourceSummary ?? null,
      text: candidate.text,
      title: matchedJudgment?.title ?? candidate.lookupText,
    };
  });
}
