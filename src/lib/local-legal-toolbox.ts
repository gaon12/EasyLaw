import type { SqliteDatabase } from "./db";
import { searchLocalLegalData } from "./local-legal-search";
import {
  legalSearchInputSchema,
  localSearchTool,
} from "./local-legal-search-tool";
import type { McpToolbox, McpToolDefinition } from "./mcp-client";
import {
  calculateExpression,
  calculatorInputSchema,
} from "./toolbox-calculator";
import {
  calculateDate,
  dateCalculatorInputSchema,
} from "./toolbox-date-calculator";

export { legalSearchInputSchema };

const calculatorTool: McpToolDefinition = {
  description:
    "금액, 비율, 기간 중 산술식으로 표현 가능한 값을 계산합니다. 숫자와 +, -, *, /, %, ^, 괄호만 지원합니다.",
  inputSchema: calculatorInputSchema,
  key: "local-legal/calculate",
  name: "calculate",
  serverId: "local-legal",
  serverLabel: "EasyLaw tools",
  title: "계산기",
};

const dateCalculatorTool: McpToolDefinition = {
  description:
    "기준일에 일/개월/년을 더하거나, 두 날짜 사이 일수와 요일을 계산합니다. 날짜는 YYYY-MM-DD 형식입니다.",
  inputSchema: dateCalculatorInputSchema,
  key: "local-legal/calculate_date",
  name: "calculate_date",
  serverId: "local-legal",
  serverLabel: "EasyLaw tools",
  title: "날짜 계산기",
};

const localTools = [localSearchTool, calculatorTool, dateCalculatorTool];

export function createLocalLegalToolbox(db: SqliteDatabase): McpToolbox {
  return {
    tools: localTools,
    async call(toolKey, args) {
      if (toolKey === localSearchTool.key) {
        return searchLocalLegalData(db, args);
      }
      if (toolKey === calculatorTool.key) {
        return calculateExpression(args);
      }
      if (toolKey === dateCalculatorTool.key) {
        return calculateDate(args);
      }
      throw new Error(`local_tool_not_found:${toolKey}`);
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
