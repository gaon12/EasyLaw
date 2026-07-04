import type { CoverageLevel, ResearchMode } from "./legal-research";

/**
 * 규칙 기반 질문 라우터. 첫 토큰 지연의 주범이던 "LLM에게 JSON 계획을
 * 먼저 만들게 하는" 단계를 대체한다. 분류가 끝나면 즉시 답변 스트리밍을
 * 시작할 수 있고, 고위험 질문만 느린 검증 하네스(deep)로 보낸다.
 */
export type ResearchRoute = {
  coverageLevel: CoverageLevel;
  hypothetical: boolean;
  intent: string;
  legalIssues: string[];
  mode: ResearchMode;
};

// 오류 비용이 커서 검증 하네스를 태울 가치가 있는 신호들.
const deepSignals = [
  "처벌",
  "형사",
  "징역",
  "벌금",
  "구속",
  "고소",
  "고발",
  "체포",
  "압수",
  "수색",
  "기소",
  "구형",
  "전과",
  "성범죄",
  "성폭",
  "마약",
  "살인",
  "의료사고",
  "의료과실",
  "소송",
  "재판",
  "검찰",
  "경찰 조사",
  "영장",
];

// 검색 없이 바로 답해도 되는 용어·사용법 질문 패턴.
const quickPatterns = [
  /무슨\s*뜻/,
  /뜻이\s*(뭐|무엇)/,
  /(이|가)란\s*(무엇|뭐)/,
  /의\s*(정의|의미)/,
  /(정의|의미)(가|는)\s*(뭐|무엇)/,
  /사용법/,
  /어떻게\s*(써|사용)/,
];

// 가상·초현실 전제 신호. 전제를 존중하되 쟁점별 검색을 더 요구한다.
const hypotheticalSignals = [
  "엘프",
  "드래곤",
  "고블린",
  "오크",
  "마법",
  "마력",
  "포션",
  "좀비",
  "뱀파이어",
  "외계인",
  "타임머신",
  "초능력",
  "이세계",
];

// intent 라벨과 legalIssues 추출에 쓰는 도메인 키워드.
const issueKeywords = [
  "손해배상",
  "중고거래",
  "사기",
  "계약",
  "임대차",
  "전세",
  "보증금",
  "해고",
  "임금",
  "퇴직금",
  "이혼",
  "상속",
  "양육권",
  "저작권",
  "명예훼손",
  "층간소음",
  "교통사고",
  "음주운전",
  "폭행",
  "절도",
  "환불",
  "하자",
  "보험",
  "세금",
  "개인정보",
];

export function routeResearchQuery(query: string): ResearchRoute {
  const normalized = query.trim();
  const legalIssues = issueKeywords.filter((keyword) =>
    normalized.includes(keyword),
  );
  const hypothetical = hypotheticalSignals.some((signal) =>
    normalized.includes(signal),
  );
  const deepMatches = deepSignals.filter((signal) =>
    normalized.includes(signal),
  );

  if (
    deepMatches.length === 0 &&
    quickPatterns.some((pattern) => pattern.test(normalized))
  ) {
    return {
      coverageLevel: 1,
      hypothetical,
      intent: intentLabel(normalized, legalIssues, "용어·개념 설명"),
      legalIssues,
      mode: "quick",
    };
  }

  if (deepMatches.length > 0) {
    return {
      coverageLevel: 4,
      hypothetical,
      intent: normalized.slice(0, 200),
      legalIssues: dedupe([...legalIssues, ...deepMatches]).slice(0, 6),
      mode: "deep",
    };
  }

  return {
    coverageLevel: 2,
    hypothetical,
    intent: intentLabel(normalized, legalIssues, "법률 상황 안내"),
    legalIssues,
    mode: "overview",
  };
}

function intentLabel(query: string, issues: string[], fallback: string) {
  if (issues.length > 0) {
    return `${issues.slice(0, 3).join("·")} 관련 ${fallback}`;
  }
  const summary = query.replaceAll(/\s+/g, " ").slice(0, 40);
  return summary.length > 0 ? `"${summary}" ${fallback}` : fallback;
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}
