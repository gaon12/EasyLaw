import type { ResearchHarnessStep, ResearchMode } from "./legal-research";

const planningStep: ResearchHarnessStep = {
  id: "intent",
  label: "답변 경로 선택",
  description:
    "검색이 필요 없는 질문은 바로 답하고, 필요한 경우에만 MCP 도구를 사용합니다.",
};
const toolStep: ResearchHarnessStep = {
  id: "tools",
  label: "MCP 도구 검색",
  description:
    "LLM이 연결된 도구의 설명과 스키마를 보고 검색 도구와 인자를 직접 선택합니다.",
};
const overviewStep: ResearchHarnessStep = {
  id: "overview",
  label: "AI 오버뷰",
  description: "MCP 결과를 문장별 출처와 함께 읽기 쉬운 답변으로 구성합니다.",
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
    return [planningStep];
  }
  if (mode === "deep") {
    return [planningStep, toolStep, overviewStep, verificationStep];
  }
  return [planningStep, toolStep, overviewStep];
}

export function researchHarnessFlowchart() {
  return `flowchart TD
    A[User Query] --> B[LLM Router]
    B --> C{Needs Search?}
    C -->|No| D[Quick Answer]
    C -->|Yes| E[MCP tools/list]
    E --> F[LLM Tool Selection]
    F --> G[MCP tools/call]
    G --> H{Enough Evidence?}
    H -->|No| F
    H -->|Yes| I[AI Overview]
    I --> J{High Risk?}
    J -->|No| K[Final Answer]
    J -->|Yes| L[Verifier]
    L --> K`;
}
