import type { McpToolDefinition } from "./mcp-client";

export const legalSearchInputSchema = {
  properties: {
    caseType: {
      description: "사건/문서 유형",
      enum: [
        "civil",
        "criminal",
        "administrative",
        "family",
        "constitutional",
        "law",
      ],
      type: "string",
    },
    courtName: {
      description: "법원명 또는 기관명 일부",
      type: "string",
    },
    dateFrom: {
      description: "선고일/시행일 시작일(YYYY-MM-DD)",
      type: "string",
    },
    dateTo: {
      description: "선고일/시행일 종료일(YYYY-MM-DD)",
      type: "string",
    },
    limit: {
      description: "반환할 최대 결과 수(1-20)",
      type: "integer",
    },
    provider: {
      description: "데이터 출처",
      enum: [
        "open-law",
        "open-law-constitutional",
        "open-law-law",
        "open-law-administrative-rule",
        "open-law-ordinance",
      ],
      type: "string",
    },
    query: {
      description: "검색할 법률 쟁점, 법령명, 사건번호, 키워드",
      type: "string",
    },
  },
  required: ["query"],
  type: "object",
} as const;

export const localSearchTool: McpToolDefinition = {
  description:
    "EasyLaw 데이터베이스에 저장된 판례, 법령, 헌재결정례, 행정규칙, 자치법규를 검색합니다. 사건유형, 출처, 법원/기관, 날짜 범위로 좁힐 수 있습니다.",
  inputSchema: legalSearchInputSchema,
  key: "local-legal/search_local_legal_data",
  name: "search_local_legal_data",
  serverId: "local-legal",
  serverLabel: "EasyLaw DB",
  title: "내부 법률 데이터 검색",
};

export const localLawSearchTool: McpToolDefinition = {
  description:
    "EasyLaw에 수집된 법률, 시행령, 시행규칙 등 법령 문서만 검색합니다. 판례와 구분해 현재 법적 의무·금지·벌칙의 직접 근거를 찾을 때 사용합니다.",
  inputSchema: {
    properties: {
      limit: legalSearchInputSchema.properties.limit,
      query: legalSearchInputSchema.properties.query,
    },
    required: ["query"],
    type: "object",
  },
  key: "local-legal/search_laws",
  name: "search_laws",
  serverId: "local-legal",
  serverLabel: "EasyLaw DB",
  title: "수집 법령 검색",
};
