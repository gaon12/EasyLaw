import type { SqliteDatabase } from "./db";
import { getSetting } from "./settings";

export type CoverageLevel = 1 | 2 | 3 | 4;

export type ResearchHarnessStep = {
  id: string;
  label: string;
  description: string;
};

export type ResearchEvidence = {
  source: string;
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
};

export type ResearchPlan = {
  query: string;
  coverageLevel: CoverageLevel;
  coverageLabel: string;
  intent: string;
  steps: ResearchHarnessStep[];
  evidence: ResearchEvidence[];
  answer: string;
  modelLabel: string;
};

const harnessSteps: ResearchHarnessStep[] = [
  {
    id: "intent",
    label: "Intent Analyzer",
    description: "질문의 사실관계, 원하는 결과, 긴급도를 분리합니다.",
  },
  {
    id: "coverage",
    label: "Coverage Policy",
    description: "법령·판례·해석례·외부자료 중 어디까지 확인할지 정합니다.",
  },
  {
    id: "router",
    label: "Tool Router",
    description:
      "korean-law-mcp, 판례 API, 내부 DB, 공개데이터 검색을 배정합니다.",
  },
  {
    id: "evidence",
    label: "Evidence Store",
    description: "출처, 신뢰도, 반대 근거 후보를 한곳에 모읍니다.",
  },
  {
    id: "reasoning",
    label: "Legal Reasoning Builder",
    description: "요건사실과 쟁점을 연결해 답변 초안을 만듭니다.",
  },
  {
    id: "verify",
    label: "Verifier",
    description:
      "인용 오류, 근거 부족, 법률 자문처럼 단정적인 표현을 완화합니다.",
  },
];

export function getResearchHarnessFlowchart() {
  return `flowchart TD
    A[User Query] --> B[Legal Research Orchestrator]
    B --> C[Intent Analyzer]
    C --> D[Risk & Coverage Policy]
    D --> E{Coverage Level}
    E -->|Level 1| F[법령 확인]
    E -->|Level 2| G[법령 + 판례 확인]
    E -->|Level 3| H[법령 + 판례 + 헌재 + 해석례 확인]
    E -->|Level 4| I[전수 탐색 + 외부자료 + 반대근거 확인]
    F --> J[Tool Router]
    G --> J
    H --> J
    I --> J
    J --> K[korean-law-mcp]
    J --> L[Case Law API]
    J --> M[Internal DB]
    J --> N[External Search]
    J --> O[Public Data API]
    K --> P[Evidence Store]
    L --> P
    M --> P
    N --> P
    O --> P
    P --> Q[Evidence Graph Builder]
    Q --> R[Legal Reasoning Builder]
    R --> S[Easy-Read Transformer]
    S --> T[Verifier]
    T --> U{검증 결과}
    U -->|통과| V[Final Answer]
    U -->|근거 부족| W[추가 검색]
    U -->|인용 오류| X[재작성]
    U -->|위험 표현| Y[법률 자문 표현 완화]
    W --> J
    X --> T
    Y --> T`;
}

export function buildResearchPlan(
  db: SqliteDatabase,
  query: string,
): ResearchPlan {
  const normalizedQuery = query.trim();
  const coverageLevel = inferCoverageLevel(normalizedQuery);
  const model = getSetting(db, "llm_model") ?? "harness-preview";
  const provider = getSetting(db, "llm_provider") ?? "설정 전";
  const hasApiKey = Boolean(getSetting(db, "llm_api_key"));
  const mcpEndpoint = getSetting(db, "mcp_korean_law_endpoint");
  const evidence = buildEvidence(
    normalizedQuery,
    coverageLevel,
    Boolean(mcpEndpoint),
  );

  return {
    query: normalizedQuery,
    coverageLevel,
    coverageLabel: coverageLabel(coverageLevel),
    intent: inferIntent(normalizedQuery),
    steps: harnessSteps,
    evidence,
    answer: buildAnswer(normalizedQuery, coverageLevel, evidence, hasApiKey),
    modelLabel: hasApiKey ? `${provider} / ${model}` : "하네스 미리보기",
  };
}

function inferCoverageLevel(query: string): CoverageLevel {
  const level4Signals = ["헌법", "위헌", "전수", "대법원", "반대", "응급실"];
  const level3Signals = ["처벌", "형사", "경찰", "신고", "의사", "행정"];
  const level2Signals = ["소송", "판례", "배상", "돈", "사기", "차용증"];

  if (level4Signals.some((signal) => query.includes(signal))) {
    return 4;
  }
  if (level3Signals.some((signal) => query.includes(signal))) {
    return 3;
  }
  if (level2Signals.some((signal) => query.includes(signal))) {
    return 2;
  }
  return 1;
}

function coverageLabel(level: CoverageLevel) {
  switch (level) {
    case 1:
      return "법령 중심 확인";
    case 2:
      return "법령 + 판례 확인";
    case 3:
      return "법령 + 판례 + 해석례 확인";
    case 4:
      return "전수 탐색 + 반대근거 확인";
  }
}

function inferIntent(query: string) {
  if (query.includes("신고") || query.includes("처벌")) {
    return "형사 절차와 처벌 가능성 확인";
  }
  if (
    query.includes("돈") ||
    query.includes("배상") ||
    query.includes("소송")
  ) {
    return "피해 회복과 민사 청구 가능성 확인";
  }
  return "사실관계에 맞는 법적 쟁점 탐색";
}

function buildEvidence(
  query: string,
  level: CoverageLevel,
  hasMcpEndpoint: boolean,
): ResearchEvidence[] {
  const base: ResearchEvidence[] = [
    {
      source: hasMcpEndpoint ? "korean-law-mcp" : "korean-law-mcp 예정",
      title: "관련 법령 후보",
      summary:
        "질문 속 행위, 피해, 당사자 관계를 기준으로 적용 법령 후보를 찾습니다.",
      confidence: hasMcpEndpoint ? "medium" : "low",
    },
  ];

  if (level >= 2) {
    base.push({
      source: "Case Law API",
      title: "유사 판례 후보",
      summary:
        "동일한 쟁점의 판례가 있는지 사건 유형과 핵심 키워드로 대조합니다.",
      confidence: "medium",
    });
  }
  if (level >= 3) {
    base.push({
      source: "Public Data API",
      title: "기관 안내와 절차 자료",
      summary:
        "신고, 소송, 신청처럼 절차가 필요한 사안은 공공 안내 자료를 함께 봅니다.",
      confidence: "medium",
    });
  }
  if (level >= 4) {
    base.push({
      source: "External Search",
      title: "반대 근거와 예외 사유",
      summary: `“${query.slice(0, 24)}…” 쟁점에서 결론이 달라질 수 있는 예외를 따로 점검합니다.`,
      confidence: "low",
    });
  }

  return base;
}

function buildAnswer(
  query: string,
  level: CoverageLevel,
  evidence: ResearchEvidence[],
  hasApiKey: boolean,
) {
  const opening = hasApiKey
    ? "설정된 LLM과 리서치 하네스를 사용해 초안을 만들었어요."
    : "아직 LLM API가 설정되지 않아 하네스 미리보기 방식으로 답변 구조를 보여드려요.";
  const evidenceSummary = evidence
    .map((item) => `- ${item.title}: ${item.summary}`)
    .join("\n");

  return `${opening}

질문은 “${query || "입력된 질문"}”로 이해했어요. 현재는 ${coverageLabel(level)} 범위가 적절해 보여요.

먼저 사실관계를 시간순으로 정리하고, 상대방의 행위·손해·증거를 분리해야 합니다. 그다음 적용 가능한 법령과 유사 판례를 대조해 “가능성이 높은 주장”과 “추가 확인이 필요한 부분”을 나눕니다.

근거 확인 계획:
${evidenceSummary}

주의: 이 답변은 법률 자문이 아니라 이해를 돕는 초안입니다. 실제 신고, 소송, 합의서 작성처럼 권리관계가 달라질 수 있는 결정은 전문가 확인을 권합니다.`;
}
