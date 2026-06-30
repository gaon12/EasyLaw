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
};

const harnessSteps: ResearchHarnessStep[] = [
  {
    id: "intent",
    label: "질문 의도 파악",
    description: "사용자의 사실관계, 원하는 결과, 긴급도를 분리합니다.",
  },
  {
    id: "coverage",
    label: "확인 범위 결정",
    description: "법령, 판례, 내부 DB 중 어디까지 확인할지 정합니다.",
  },
  {
    id: "router",
    label: "근거 검색",
    description:
      "공개법령 API, 내부 판결문, 보조 도구에서 근거 후보를 모읍니다.",
  },
  {
    id: "evidence",
    label: "출처 정리",
    description: "출처, 신뢰도, 반대 가능성이 있는 근거를 나눠 저장합니다.",
  },
  {
    id: "reasoning",
    label: "답변 구성",
    description: "사실관계와 근거 후보를 연결해 쉬운 답변 초안을 만듭니다.",
  },
  {
    id: "verify",
    label: "표현 점검",
    description: "단정 표현, 근거 부족, 법률 자문처럼 보이는 표현을 줄입니다.",
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
    E -->|Level 3| H[법령 + 판례 + 절차 자료 확인]
    E -->|Level 4| I[필수 재검색 + 반대 근거 확인]
    F --> J[Tool Router]
    G --> J
    H --> J
    I --> J
    J --> K[Open Law API]
    J --> L[Internal DB]
    J --> M[Public Data API]
    K --> N[Evidence Store]
    L --> N
    M --> N
    N --> O[Evidence Graph Builder]
    O --> P[Legal Reasoning Builder]
    P --> Q[Easy-Read Transformer]
    Q --> R[Verifier]
    R --> S[Final Answer]`;
}

export async function buildResearchPlan(
  db: SqliteDatabase,
  query: string,
): Promise<ResearchPlan> {
  const normalizedQuery = query.trim();
  const coverageLevel = inferCoverageLevel(normalizedQuery);
  const evidence = buildEvidence(db, normalizedQuery, coverageLevel);
  const basePlan = {
    query: normalizedQuery,
    coverageLevel,
    coverageLabel: coverageLabel(coverageLevel),
    intent: inferIntent(normalizedQuery),
    steps: harnessSteps,
    evidence,
  };

  const answer = await buildAnswer(db, basePlan);
  return { ...basePlan, answer };
}

function inferCoverageLevel(query: string): CoverageLevel {
  const level4Signals = ["대법원", "헌법", "필수", "반대", "판례 변경"];
  const level3Signals = ["처벌", "형사", "경찰", "신고", "수사", "행정"];
  const level2Signals = ["소송", "판례", "배상", "돈", "계약", "차용증"];

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
      return "법령 + 판례 + 절차 확인";
    case 4:
      return "필수 재검색 + 반대 근거 확인";
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
  db: SqliteDatabase,
  query: string,
  level: CoverageLevel,
): ResearchEvidence[] {
  const evidence: ResearchEvidence[] = [
    {
      source: "내부 법령·판례 라우터",
      title: "질문 범위와 적용 가능 근거",
      summary:
        "질문의 행위, 피해, 절차 키워드를 기준으로 확인할 법령과 판례 범위를 정합니다.",
      confidence: "medium",
    },
  ];

  const judgments = findLocalJudgments(db, query);
  for (const judgment of judgments) {
    evidence.push({
      source: judgment.source_provider,
      title: `${judgment.case_number} ${judgment.title}`,
      summary: `${judgment.court_name} ${judgment.decided_on} 판결을 관련 판례 후보로 확인했습니다.`,
      confidence: judgment.source_provider === "open-law" ? "high" : "medium",
    });
  }

  if (level >= 2 && judgments.length === 0) {
    evidence.push({
      source: "공개법령 판례 API",
      title: "유사 판례 후보",
      summary:
        "동일하거나 가까운 쟁점의 판례가 있는지 사건 유형과 핵심어로 대조합니다.",
      confidence: "medium",
    });
  }
  if (level >= 3) {
    evidence.push({
      source: "공공 절차 자료",
      title: "기관 안내와 절차 자료",
      summary:
        "신고, 소송, 신청처럼 절차가 필요한 사안은 공공 안내 자료를 함께 봅니다.",
      confidence: "medium",
    });
  }
  if (level >= 4) {
    evidence.push({
      source: "반대 근거 점검",
      title: "예외와 반대 가능성",
      summary: `"${query.slice(0, 24)}" 쟁점에서 결론이 달라질 수 있는 예외를 따로 확인합니다.`,
      confidence: "low",
    });
  }

  return evidence.slice(0, 5);
}

async function buildAnswer(
  db: SqliteDatabase,
  plan: Omit<ResearchPlan, "answer">,
) {
  const apiKey = getSetting(db, "llm_api_key");
  if (!apiKey) {
    return buildPreviewAnswer(plan);
  }

  try {
    const answer = await requestLlmAnswer(db, apiKey, plan);
    return answer || buildPreviewAnswer(plan);
  } catch (_error) {
    return `${buildPreviewAnswer(plan)}

현재 AI 응답 생성 중 오류가 있어, 우선 검증 가능한 근거 확인 계획을 보여드립니다.`;
  }
}

async function requestLlmAnswer(
  db: SqliteDatabase,
  apiKey: string,
  plan: Omit<ResearchPlan, "answer">,
) {
  const baseUrl =
    getSetting(db, "llm_api_base_url") ?? "https://api.openai.com/v1";
  const model = getSetting(db, "llm_model") ?? "gpt-5-mini";
  const url = new URL("chat/completions", ensureTrailingSlash(baseUrl));
  const response = await fetch(url, {
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            "You draft Korean legal information for EasyLaw. Be clear, cautious, evidence-aware, and do not present the answer as legal advice.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              coverage: plan.coverageLabel,
              evidence: plan.evidence,
              intent: plan.intent,
              query: plan.query,
            },
            null,
            2,
          ),
        },
      ],
      model,
      temperature: 0.2,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`llm_request_failed:${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

function buildPreviewAnswer(plan: Omit<ResearchPlan, "answer">) {
  const evidenceSummary = plan.evidence
    .map((item) => `- ${item.title}: ${item.summary}`)
    .join("\n");

  return `하네스 미리보기로 답변 구조를 먼저 보여드릴게요.

질문은 "${plan.query || "입력한 질문"}"으로 이해했어요. 현재는 ${plan.coverageLabel} 범위가 적절해 보입니다.

먼저 사실관계를 시간순으로 정리하고, 상대방의 행위와 피해 사이의 연결, 확보 가능한 증거, 필요한 절차를 나눠 확인해야 합니다. 그런 다음 적용 가능한 법령과 유사 판례를 대조해 주장할 수 있는 부분과 추가 확인이 필요한 부분을 구분합니다.

근거 확인 계획:
${evidenceSummary}

주의: 이 답변은 법률 자문이 아니라 이해를 돕는 초안입니다. 실제 신고, 소송, 합의 문서 작성처럼 권리관계가 달라질 수 있는 결정은 전문가 확인을 권합니다.`;
}

function findLocalJudgments(db: SqliteDatabase, query: string) {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 3);

  if (terms.length === 0) {
    return [];
  }

  return db
    .prepare<
      string[],
      {
        case_number: string;
        court_name: string;
        decided_on: string;
        source_provider: string;
        title: string;
      }
    >(
      `SELECT case_number, court_name, decided_on, source_provider, title
        FROM judgments
        WHERE visibility = 'public'
          AND (${terms.map(() => "(title LIKE ? OR case_number LIKE ?)").join(" OR ")})
        ORDER BY decided_on DESC
        LIMIT 3`,
    )
    .all(...terms.flatMap((term) => [`%${term}%`, `%${term}%`]));
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
