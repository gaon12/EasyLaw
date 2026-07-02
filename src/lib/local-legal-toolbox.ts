import type { SqliteDatabase } from "./db";
import type {
  McpToolbox,
  McpToolCallResult,
  McpToolDefinition,
} from "./mcp-client";

const localSearchTool: McpToolDefinition = {
  description:
    "EasyLaw 데이터베이스에 저장된 판례, 법령, 헌재결정례, 행정규칙, 자치법규를 검색합니다.",
  inputSchema: {
    properties: {
      query: {
        description: "검색할 법률 쟁점, 법령명, 사건번호, 키워드",
        type: "string",
      },
    },
    required: ["query"],
    type: "object",
  },
  key: "local-legal/search_local_legal_data",
  name: "search_local_legal_data",
  serverId: "local-legal",
  serverLabel: "EasyLaw DB",
  title: "내부 법률 데이터 검색",
};

export function createLocalLegalToolbox(db: SqliteDatabase): McpToolbox {
  return {
    tools: [localSearchTool],
    async call(toolKey, args) {
      if (toolKey !== localSearchTool.key) {
        throw new Error(`local_tool_not_found:${toolKey}`);
      }
      return searchLocalLegalData(db, args);
    },
    async close() {},
  };
}

export function mergeToolboxes(
  primary: McpToolbox,
  fallback: McpToolbox,
): McpToolbox {
  const tools =
    primary.tools.length > 0
      ? [...primary.tools, ...fallback.tools]
      : fallback.tools;
  return {
    tools,
    async call(toolKey, args) {
      if (primary.tools.some((tool) => tool.key === toolKey)) {
        return primary.call(toolKey, args);
      }
      return fallback.call(toolKey, args);
    },
    async close() {
      await Promise.allSettled([primary.close(), fallback.close()]);
    },
  };
}

function searchLocalLegalData(
  db: SqliteDatabase,
  args: Record<string, unknown>,
): McpToolCallResult {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    return { content: [], isError: false, structuredContent: { records: [] } };
  }
  const tokens = tokenize(query);
  const rows = db
    .prepare<
      string[],
      {
        case_number: string;
        court_name: string;
        decided_on: string;
        original_text: string | null;
        source_provider: string;
        source_summary: string | null;
        source_url: string | null;
        title: string;
      }
    >(
      `SELECT case_number, court_name, decided_on, title, source_provider,
        source_url, source_summary, original_text
       FROM judgments
       WHERE visibility = 'public'
         AND (${tokens
           .map(
             () => `(case_number LIKE ?
              OR court_name LIKE ?
              OR title LIKE ?
              OR source_summary LIKE ?
              OR original_text LIKE ?)`,
           )
           .join(" OR ")})
       ORDER BY decided_on DESC
       LIMIT 8`,
    )
    .all(...tokens.flatMap((token) => Array.from({ length: 5 }, () => token)));

  const records = rows.map((row) => ({
    content: row.original_text ?? row.source_summary ?? row.title,
    source: providerLabel(row.source_provider, row.court_name),
    summary: summarize(row.source_summary ?? row.original_text ?? row.title),
    title: `${row.case_number} ${row.title}`,
    url: row.source_url ?? undefined,
  }));

  return {
    content:
      records.length > 0
        ? [
            {
              text: JSON.stringify({ records }),
              type: "text",
            },
          ]
        : [],
    isError: false,
    structuredContent: { records },
  };
}

function tokenize(query: string) {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.replaceAll(/[%"_]/g, "").trim())
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  return (tokens.length > 0 ? tokens : [query]).map((token) => `%${token}%`);
}

function providerLabel(provider: string, courtName: string) {
  const labels: Record<string, string> = {
    "open-law": "국가법령정보센터 판례",
    "open-law-administrative-rule": "국가법령정보센터 행정규칙",
    "open-law-constitutional": "국가법령정보센터 헌재결정례",
    "open-law-law": "국가법령정보센터 법령",
    "open-law-ordinance": "국가법령정보센터 자치법규",
  };
  return labels[provider] ?? courtName;
}

function summarize(value: string) {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length > 700
    ? `${normalized.slice(0, 697)}...`
    : normalized;
}
