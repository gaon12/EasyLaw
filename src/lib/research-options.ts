export const answerDetailLevels = ["simple", "detailed"] as const;

export type AnswerDetailLevel = (typeof answerDetailLevels)[number];

export type ResearchOptions = {
  answerDetail: AnswerDetailLevel;
  easyExplanation: boolean;
};

export const defaultResearchOptions: ResearchOptions = {
  answerDetail: "simple",
  easyExplanation: false,
};

export function answerFormatInstruction(options: ResearchOptions) {
  const format =
    options.answerDetail === "detailed"
      ? `상세 형식으로 작성한다.
- "핵심 결론"을 먼저 쓴다.
- "육하원칙" 표에 누가·언제·어디서·무엇을·어떻게·왜를 각각 적는다. 질문에서 확인되지 않은 항목은 "확인 필요"로 표시하고 추측하지 않는다.
- "법적 근거와 적용", "추가 설명", "확인할 점"을 구분한다.
- 추가 설명할 내용이 없으면 "별도 추가 설명 없음"이라고 명시한다.`
      : `간단 형식으로 작성한다.
- 제목과 표 없이 자연스러운 줄글 6~10문장으로 쓴다.
- 결론, 핵심 근거, 달라질 수 있는 조건만 남긴다.`;
  const language = options.easyExplanation
    ? `쉬운 설명 모드다.
- 사전·법령용어 도구에서 확인한 뜻을 우선 사용한다.
- 어려운 법률 용어는 처음 나올 때 괄호 안에 일상어로 풀어 쓴다.
- 한 문장을 짧게 쓰고, 불필요한 한자어와 중첩 문장을 피한다.`
    : "일반적인 법률 설명 난이도로 작성한다.";
  return `${format}\n${language}`;
}
