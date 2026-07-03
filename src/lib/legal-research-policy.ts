import type { ResearchHarnessStep, ResearchMode } from "./legal-research";

const routeStep: ResearchHarnessStep = {
  id: "route",
  label: "질문 분류",
  description:
    "규칙 기반 라우터가 LLM 호출 없이 즉시 빠른 답변·오버뷰·심층 검토 경로를 고릅니다.",
};
const draftStep: ResearchHarnessStep = {
  id: "draft",
  label: "즉시 답변 시작",
  description:
    "근거 검색을 기다리지 않고 일반적 방향을 설명하는 초안을 바로 스트리밍합니다.",
};
const parallelSearchStep: ResearchHarnessStep = {
  id: "search",
  label: "병렬 근거 검색",
  description:
    "초안이 생성되는 동안 내부 코퍼스와 MCP 검색 도구를 동시에 호출합니다.",
};
const groundingStep: ResearchHarnessStep = {
  id: "grounding",
  label: "근거 확인",
  description:
    "검색 결과로 초안을 대조해 확인된 내용, 보완점, 출처를 이어서 표시합니다.",
};
const agentToolStep: ResearchHarnessStep = {
  id: "tools",
  label: "쟁점별 도구 검색",
  description:
    "LLM이 도구 스키마를 보고 쟁점을 나눠 검색하며, 근거가 부족하면 반복합니다.",
};
const overviewStep: ResearchHarnessStep = {
  id: "overview",
  label: "AI 오버뷰",
  description:
    "확보한 근거를 문장별 출처와 함께 읽기 쉬운 답변으로 구성합니다.",
};
const verificationStep: ResearchHarnessStep = {
  id: "verify",
  label: "심층 검증",
  description:
    "오류 비용이 큰 질문만 별도 LLM 호출로 인용과 단정 표현을 재검토합니다.",
};

export function researchModeLabel(mode: ResearchMode) {
  const labels = {
    deep: "심층 AI 오버뷰",
    overview: "AI 오버뷰",
    quick: "빠른 AI 답변",
  } satisfies Record<ResearchMode, string>;
  return labels[mode];
}

export function stepsForResearchMode(mode: ResearchMode) {
  if (mode === "quick") {
    return [routeStep, draftStep];
  }
  if (mode === "deep") {
    return [routeStep, agentToolStep, overviewStep, verificationStep];
  }
  return [routeStep, draftStep, parallelSearchStep, groundingStep];
}

export function researchHarnessFlowchart() {
  return `flowchart TD
    A[User Query] --> B[Rule Router]
    B -->|term/usage| C[Quick Streamed Answer]
    B -->|default| D[Draft Streaming Starts]
    B -->|high risk| H[Agent Tool Loop]
    D --> E[Parallel Search]
    E --> F[Grounding Section]
    F --> G[Final Answer + Sources]
    H --> I{Enough Evidence?}
    I -->|No| H
    I -->|Yes| J[AI Overview]
    J --> K[Verifier]
    K --> G`;
}
