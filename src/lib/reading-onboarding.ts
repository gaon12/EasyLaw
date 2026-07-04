export type ReaderView = "original" | "plain_language" | "easy_read";

export type PreferredReading = ReaderView;

export type LegalDocumentFamiliarity =
  | "familiar"
  | "difficult"
  | "very_difficult";

export type LongTextComfort = "fine" | "some" | "high";

export type ReadingOnboardingAnswers = {
  preferredReading: PreferredReading | null;
  legalDocumentFamiliarity: LegalDocumentFamiliarity | null;
  longTextComfort: LongTextComfort | null;
};

export type ReadingRecommendation = {
  description: string;
  summaryFirst: boolean;
  title: string;
  view: ReaderView;
};

export const defaultReaderView: ReaderView = "plain_language";

const recommendations: Record<
  ReaderView,
  Omit<ReadingRecommendation, "view">
> = {
  original: {
    description: "원래 판결문 구조와 표현을 그대로 먼저 보여드립니다.",
    summaryFirst: false,
    title: "원문",
  },
  plain_language: {
    description:
      "원문을 보지 않아도 판결의 결론과 이유를 이해할 수 있게 설명합니다.",
    summaryFirst: false,
    title: "쉬운 해설",
  },
  easy_read: {
    description: "짧은 문장과 큰 글씨로 핵심 내용을 먼저 보여드립니다.",
    summaryFirst: true,
    title: "이지리드",
  },
};

export function recommendReaderView(
  answers: ReadingOnboardingAnswers,
): ReadingRecommendation {
  const view = selectReaderView(answers);
  const recommendation = recommendations[view];
  return {
    ...recommendation,
    summaryFirst:
      recommendation.summaryFirst || answers.longTextComfort === "some",
    view,
  };
}

export function getReaderViewTitle(view: ReaderView): string {
  return recommendations[view].title;
}

function selectReaderView(answers: ReadingOnboardingAnswers): ReaderView {
  if (
    answers.preferredReading === "original" &&
    answers.legalDocumentFamiliarity !== "difficult" &&
    answers.longTextComfort !== "high"
  ) {
    return "original";
  }

  if (
    answers.preferredReading === "easy_read" ||
    answers.legalDocumentFamiliarity === "very_difficult" ||
    answers.longTextComfort === "high"
  ) {
    return "easy_read";
  }

  return defaultReaderView;
}

export function isReaderView(value: string | null): value is ReaderView {
  return (
    value === "original" || value === "plain_language" || value === "easy_read"
  );
}
