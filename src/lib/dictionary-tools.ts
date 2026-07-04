import type { SqliteDatabase } from "./db";
import { searchDictionaryTerms } from "./dictionary/repository";
import type { DictionarySource } from "./dictionary/types";
import type {
  McpToolbox,
  McpToolCallResult,
  McpToolDefinition,
} from "./mcp-client";

const dictionaryInputSchema = {
  properties: {
    query: {
      description: "뜻을 확인할 단어 또는 단어가 포함된 짧은 문장",
      type: "string",
    },
  },
  required: ["query"],
  type: "object",
} as const;

function dictionaryTool(
  name: string,
  title: string,
  description: string,
): McpToolDefinition {
  return {
    description,
    inputSchema: dictionaryInputSchema,
    key: `local-dictionary/${name}`,
    name,
    serverId: "local-dictionary",
    serverLabel: "EasyLaw 사전",
    title,
  };
}

export const legalTermTool = dictionaryTool(
  "search_legal_terms",
  "법령용어 사전",
  "수집한 법령용어 사전에서 법률 용어의 공식적인 뜻과 출처 법령을 찾습니다.",
);

export const basicDictionaryTool = dictionaryTool(
  "search_basic_korean_dictionary",
  "한국어기초사전",
  "수집한 한국어기초사전에서 일상적인 쉬운 뜻풀이를 찾습니다.",
);

export const standardDictionaryTool = dictionaryTool(
  "search_standard_korean_dictionary",
  "표준국어대사전",
  "수집한 표준국어대사전에서 표준적인 뜻풀이와 품사를 찾습니다.",
);

export const dictionaryTools = [
  legalTermTool,
  basicDictionaryTool,
  standardDictionaryTool,
];

export function createDictionaryToolbox(db: SqliteDatabase): McpToolbox {
  return {
    tools: dictionaryTools,
    async call(toolKey, args) {
      const tool = dictionaryTools.find(
        (candidate) => candidate.key === toolKey,
      );
      if (!tool) {
        throw new Error(`dictionary_tool_not_found:${toolKey}`);
      }
      const source = sourceForTool(tool.key);
      const query = typeof args.query === "string" ? args.query : "";
      const records = searchDictionaryTerms(db, { query, source }).map(
        (term) => ({
          content: term.definition,
          definition: term.definition,
          documentType: "dictionary",
          origin: term.origin,
          partOfSpeech: term.partOfSpeech,
          senseNo: term.senseNo,
          source: sourceLabel(term.source),
          title: term.word,
          word: term.word,
        }),
      );
      return dictionaryResult(records);
    },
    async close() {},
  };
}

function dictionaryResult(
  records: Array<Record<string, string | null>>,
): McpToolCallResult {
  return {
    content:
      records.length > 0
        ? [{ text: JSON.stringify({ records }), type: "text" }]
        : [],
    isError: false,
    structuredContent: { records },
  };
}

function sourceForTool(toolKey: string): DictionarySource {
  if (toolKey === legalTermTool.key) {
    return "legal";
  }
  if (toolKey === basicDictionaryTool.key) {
    return "basic";
  }
  return "standard";
}

function sourceLabel(source: DictionarySource) {
  if (source === "legal") {
    return "법령용어 사전";
  }
  if (source === "basic") {
    return "한국어기초사전";
  }
  return "표준국어대사전";
}
