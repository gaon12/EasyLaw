import type { SqliteDatabase } from "../db";
import { getSetting } from "../settings";
import { findDictionaryTerms } from "./repository";

export function buildTermExplanation(
  db: SqliteDatabase,
  input: { context?: string; term: string },
) {
  const cleanTerm = input.term.trim().replace(/\s+/g, " ").slice(0, 40);
  const cleanContext = input.context?.trim().replace(/\s+/g, " ").slice(0, 500);
  const definitions = findDictionaryTerms(db, cleanTerm);
  const selectedDefinition = definitions[0];
  const mcpEndpoint = getSetting(db, "mcp_korean_law_endpoint");

  return {
    aiAvailable: Boolean(mcpEndpoint),
    aiExplanation: selectedDefinition
      ? contextualMessage(
          cleanTerm,
          selectedDefinition.definition,
          cleanContext,
        )
      : "로컬 사전에서 찾지 못했어요. MCP/AI 연결이 준비되면 문맥 기반 설명을 시도할 수 있어요.",
    definitions,
    plain:
      selectedDefinition?.definition ??
      "아직 로컬 사전에서 찾지 못했어요. 관리자센터에서 사전 데이터를 업데이트해 주세요.",
    priority:
      selectedDefinition?.source === "legal"
        ? "자체 법률 용어 사전"
        : selectedDefinition?.source === "basic"
          ? "한국어기초사전"
          : selectedDefinition?.source === "standard"
            ? "표준국어대사전"
            : "AI 문맥 설명",
    term: cleanTerm,
  };
}

function contextualMessage(term: string, definition: string, context?: string) {
  if (!context) {
    return `${term}은(는) 여기서는 “${definition}” 정도로 이해하면 좋아요. 문맥에 따라 법률상 의미가 달라질 수 있어 문장 전체와 함께 확인해 주세요.`;
  }
  return `선택한 문맥에서는 ${term}을(를) “${definition}”에 가깝게 읽는 것이 자연스러워요. 다만 법률 문서에서는 주변 문장과 조문 근거가 의미를 좁힐 수 있어요.`;
}
