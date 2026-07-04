export type ResearchSkillKey =
  | "compose_answer"
  | "draft_answer"
  | "retrieve_evidence"
  | "select_tools"
  | "summarize_question"
  | "verify_answer";

export type ResearchSkillStage = "completed" | "failed" | "running";

export type ResearchSkillEvent = {
  detail: string;
  key: ResearchSkillKey;
  stage: ResearchSkillStage;
  title: string;
};

const skillCatalog = {
  compose_answer: {
    title: "답변 구성 스킬",
  },
  draft_answer: {
    title: "빠른 초안 스킬",
  },
  retrieve_evidence: {
    title: "근거 수집 스킬",
  },
  select_tools: {
    title: "도구 선택 스킬",
  },
  summarize_question: {
    title: "질문 요약 스킬",
  },
  verify_answer: {
    title: "검증 스킬",
  },
} satisfies Record<ResearchSkillKey, { title: string }>;

export function researchSkillEvent(
  key: ResearchSkillKey,
  stage: ResearchSkillStage,
  detail: string,
): ResearchSkillEvent {
  return {
    detail,
    key,
    stage,
    title: skillCatalog[key].title,
  };
}
