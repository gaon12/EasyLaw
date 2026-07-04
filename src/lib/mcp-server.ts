import type { SqliteDatabase } from "./db";
import { getJudgmentText } from "./judgment-texts";
import {
  createLocalLegalToolbox,
  legalSearchInputSchema,
} from "./local-legal-toolbox";
import { getPublicJudgmentByIdentifier } from "./queries";
import { calculatorInputSchema } from "./toolbox-calculator";
import { dateCalculatorInputSchema } from "./toolbox-date-calculator";

/**
 * EasyLaw 코퍼스를 외부 MCP 클라이언트에 노출하는 stateless
 * Streamable HTTP 서버 구현. 세션 없이 요청 단위로 처리하며
 * initialize / tools/list / tools/call / ping만 지원한다(읽기 전용).
 */

export const MCP_PROTOCOL_VERSION = "2025-03-26";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

export type McpServerResponse =
  | { kind: "json"; body: Record<string, unknown>; status: number }
  | { kind: "empty"; status: number };

const tools = [
  {
    annotations: { readOnlyHint: true },
    description:
      "EasyLaw에 수집된 공개 판례, 헌재결정례, 법령, 행정규칙, 자치법규를 전문 검색합니다. 사건유형, 출처, 기관명, 날짜 범위 필터를 지원합니다.",
    inputSchema: legalSearchInputSchema,
    name: "search_legal_corpus",
    title: "법률 코퍼스 검색",
  },
  {
    annotations: { readOnlyHint: true },
    description:
      "공개 판결문·법령 문서 하나의 메타데이터와 원문을 가져옵니다. id 또는 사건번호를 사용합니다.",
    inputSchema: {
      properties: {
        identifier: {
          description: "판결문 id 또는 사건번호",
          type: "string",
        },
      },
      required: ["identifier"],
      type: "object",
    },
    name: "get_legal_document",
    title: "법률 문서 조회",
  },
  {
    annotations: { readOnlyHint: true },
    description:
      "금액, 비율, 산술식 계산을 수행합니다. 숫자와 +, -, *, /, %, ^, 괄호만 지원합니다.",
    inputSchema: calculatorInputSchema,
    name: "calculate",
    title: "계산기",
  },
  {
    annotations: { readOnlyHint: true },
    description:
      "오늘 날짜, 요일, 날짜 더하기, 두 날짜 사이 일수를 계산합니다. 날짜는 YYYY-MM-DD 형식입니다.",
    inputSchema: dateCalculatorInputSchema,
    name: "calculate_date",
    title: "날짜 계산기",
  },
] as const;

export async function handleMcpRequest(
  db: SqliteDatabase,
  payload: unknown,
): Promise<McpServerResponse> {
  if (Array.isArray(payload)) {
    return rpcError(null, -32600, "배치 요청은 지원하지 않습니다.");
  }
  if (!isRecord(payload) || typeof payload.method !== "string") {
    return rpcError(null, -32600, "JSON-RPC 요청 형식이 아닙니다.");
  }
  const request = payload as JsonRpcRequest;
  const method = request.method ?? "";

  // 알림(notification)은 id가 없다 — 본문 없이 202로 수신 확인만 한다.
  if (request.id === undefined || request.id === null) {
    return { kind: "empty", status: 202 };
  }

  if (method === "initialize") {
    const requested = isRecord(request.params)
      ? request.params.protocolVersion
      : undefined;
    return rpcResult(request.id, {
      capabilities: { tools: {} },
      protocolVersion:
        typeof requested === "string" ? requested : MCP_PROTOCOL_VERSION,
      serverInfo: { name: "easylaw-legal-corpus", version: "1.0.0" },
    });
  }
  if (method === "ping") {
    return rpcResult(request.id, {});
  }
  if (method === "tools/list") {
    return rpcResult(request.id, { tools });
  }
  if (method === "tools/call") {
    const params = isRecord(request.params) ? request.params : {};
    const name = typeof params.name === "string" ? params.name : "";
    const args = isRecord(params.arguments) ? params.arguments : {};
    try {
      const result = await callTool(db, name, args);
      return rpcResult(request.id, result);
    } catch (error) {
      return rpcResult(request.id, {
        content: [
          {
            text:
              error instanceof Error
                ? error.message
                : "도구 호출에 실패했습니다.",
            type: "text",
          },
        ],
        isError: true,
      });
    }
  }

  return rpcError(request.id, -32601, `지원하지 않는 메서드입니다: ${method}`);
}

async function callTool(
  db: SqliteDatabase,
  name: string,
  args: Record<string, unknown>,
) {
  if (name === "search_legal_corpus") {
    const toolbox = createLocalLegalToolbox(db);
    const result = await toolbox.call(
      "local-legal/search_local_legal_data",
      args,
    );
    return {
      content: result.content,
      isError: result.isError,
      structuredContent: result.structuredContent,
    };
  }

  if (name === "calculate") {
    const toolbox = createLocalLegalToolbox(db);
    const result = await toolbox.call("local-legal/calculate", args);
    return {
      content: result.content,
      isError: result.isError,
      structuredContent: result.structuredContent,
    };
  }

  if (name === "calculate_date") {
    const toolbox = createLocalLegalToolbox(db);
    const result = await toolbox.call("local-legal/calculate_date", args);
    return {
      content: result.content,
      isError: result.isError,
      structuredContent: result.structuredContent,
    };
  }

  if (name === "get_legal_document") {
    const identifier =
      typeof args.identifier === "string" ? args.identifier.trim() : "";
    if (!identifier) {
      throw new Error("identifier가 필요합니다.");
    }
    const judgment = getPublicJudgmentByIdentifier(db, identifier);
    if (!judgment) {
      return {
        content: [
          { text: "해당 공개 문서를 찾지 못했습니다.", type: "text" as const },
        ],
        isError: true,
      };
    }
    const document = {
      caseNumber: judgment.caseNumber,
      caseType: judgment.caseType,
      courtName: judgment.courtName,
      decidedOn: judgment.decidedOn,
      id: judgment.id,
      originalText:
        judgment.originalText ?? getJudgmentText(db, judgment.id) ?? null,
      sourceProvider: judgment.sourceProvider,
      sourceSummary: judgment.sourceSummary,
      sourceUrl: judgment.sourceUrl,
      title: judgment.title,
    };
    return {
      content: [{ text: JSON.stringify(document), type: "text" as const }],
      isError: false,
      structuredContent: document as unknown as Record<string, unknown>,
    };
  }

  throw new Error(`알 수 없는 도구입니다: ${name}`);
}

function rpcResult(
  id: string | number,
  result: Record<string, unknown>,
): McpServerResponse {
  return {
    body: { id, jsonrpc: "2.0", result },
    kind: "json",
    status: 200,
  };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
): McpServerResponse {
  return {
    body: { error: { code, message }, id, jsonrpc: "2.0" },
    kind: "json",
    status: 200,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
