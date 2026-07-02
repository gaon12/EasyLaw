import type { SqliteDatabase } from "./db";
import {
  type AgentDecision,
  composeResearchAnswer,
  forceResearchAnswer,
  requestAgentDecision,
  verifyResearchAnswer,
} from "./legal-research-agent";
import {
  researchHarnessFlowchart,
  researchModeLabel,
  stepsForResearchMode,
} from "./legal-research-policy";
import {
  type LlmConfiguration,
  LlmError,
  readLlmConfiguration,
} from "./llm-client";
import { createLocalLegalToolbox, mergeToolboxes } from "./local-legal-toolbox";
import {
  connectMcpToolbox,
  type McpToolbox,
  type McpToolDefinition,
} from "./mcp-client";
import { evidenceFromMcpResult, type McpEvidenceDraft } from "./mcp-evidence";

export type CoverageLevel = 1 | 2 | 3 | 4;
export type ResearchMode = "quick" | "overview" | "deep";

export type ResearchHarnessStep = {
  id: string;
  label: string;
  description: string;
};

export type ResearchEvidence = McpEvidenceDraft & {
  id: string;
};

export type ResearchPlan = {
  answer: string;
  assumptions: string[];
  coverageLabel: string;
  coverageLevel: CoverageLevel;
  evidence: ResearchEvidence[];
  hypothetical: boolean;
  intent: string;
  legalIssues: string[];
  mode: ResearchMode;
  query: string;
  steps: ResearchHarnessStep[];
};

export type ResearchHarnessEvent =
  | { type: "plan"; plan: Omit<ResearchPlan, "answer" | "evidence"> }
  | { type: "evidence"; evidence: ResearchEvidence }
  | { type: "answer"; answer: string; verified: boolean }
  | {
      type: "progress";
      detail: string;
      status: "completed" | "running";
      title: string;
    }
  | { type: "warning"; message: string }
  | {
      type: "tool";
      stage: "calling" | "completed" | "failed";
      tool: string;
    }
  | {
      type: "phase";
      phase:
        | "composing"
        | "connecting"
        | "planning"
        | "retrieving"
        | "verifying";
    };

export function getResearchHarnessFlowchart() {
  return researchHarnessFlowchart();
}

export function isResearchHarnessConfigured(db: SqliteDatabase) {
  return readLlmConfiguration(db) !== null;
}

export async function buildResearchPlan(
  db: SqliteDatabase,
  query: string,
  onEvent?: (event: ResearchHarnessEvent) => void,
): Promise<ResearchPlan> {
  const normalizedQuery = query.trim();
  const configuration = readLlmConfiguration(db);
  if (!configuration) {
    throw new LlmError(
      "llm_not_configured",
      "관리자 LLM 설정을 먼저 완료해 주세요.",
    );
  }

  onEvent?.({ phase: "connecting", type: "phase" });
  const toolbox = mergeToolboxes(
    await connectMcpToolbox(db),
    createLocalLegalToolbox(db),
  );
  try {
    return await runToolLoop(configuration, toolbox, normalizedQuery, onEvent);
  } finally {
    await toolbox.close();
  }
}

async function runToolLoop(
  configuration: LlmConfiguration,
  toolbox: McpToolbox,
  query: string,
  onEvent?: (event: ResearchHarnessEvent) => void,
): Promise<ResearchPlan> {
  const evidence: ResearchEvidence[] = [];
  const history: Array<{
    arguments: Record<string, unknown>;
    status: "completed" | "failed";
    toolKey: string;
  }> = [];
  let plan: Omit<ResearchPlan, "answer" | "evidence"> | null = null;
  const reviewFeedback: string[] = [];

  for (let iteration = 0; iteration < 5; iteration += 1) {
    onEvent?.({
      phase: iteration === 0 ? "planning" : "retrieving",
      type: "phase",
    });
    const decision = await requestAgentDecision(configuration, {
      evidence,
      history,
      plan,
      query,
      reviewFeedback,
      tools: toolbox.tools,
    });
    plan ??= createPlan(query, decision);
    if (iteration === 0) {
      onEvent?.({ plan, type: "plan" });
    }

    if (decision.type === "answer") {
      const rejection = rejectUngroundedAnswer(
        plan,
        evidence,
        history,
        decision.answer,
      );
      if (rejection) {
        onEvent?.({
          detail: rejection,
          status: "running",
          title: "답변 보류",
          type: "progress",
        });
        reviewFeedback.push(rejection);
        if (toolbox.tools.length === 0) {
          throw new LlmError(
            "mcp_unavailable",
            "검색이 필요한 질문이지만 연결된 MCP 검색 도구가 없습니다.",
          );
        }
        continue;
      }
      return finishAnswer(
        configuration,
        plan,
        evidence,
        decision.answer,
        query,
        onEvent,
      );
    }
    if (toolbox.tools.length === 0) {
      throw new LlmError(
        "mcp_unavailable",
        "검색이 필요한 질문이지만 연결된 MCP 검색 도구가 없습니다.",
      );
    }

    await executeToolCalls(
      toolbox,
      toolbox.tools,
      decision.calls,
      evidence,
      history,
      onEvent,
    );
  }

  if (!plan) {
    throw new LlmError(
      "llm_response_invalid",
      "질문 처리 계획을 만들지 못했습니다.",
    );
  }
  const answer = await forceResearchAnswer(
    configuration,
    query,
    plan,
    evidence,
  );
  return finishAnswer(configuration, plan, evidence, answer, query, onEvent);
}

async function executeToolCalls(
  toolbox: McpToolbox,
  tools: McpToolDefinition[],
  calls: Array<{ arguments: Record<string, unknown>; toolKey: string }>,
  evidence: ResearchEvidence[],
  history: Array<{
    arguments: Record<string, unknown>;
    status: "completed" | "failed";
    toolKey: string;
  }>,
  onEvent?: (event: ResearchHarnessEvent) => void,
) {
  for (const call of calls) {
    const tool = tools.find((item) => item.key === call.toolKey);
    if (!tool) {
      history.push({ ...call, status: "failed" });
      continue;
    }
    onEvent?.({ stage: "calling", tool: tool.title, type: "tool" });
    try {
      const result = await toolbox.call(call.toolKey, call.arguments);
      const drafts = result.isError
        ? []
        : evidenceFromMcpResult(tool, call.arguments, result);
      for (const draft of drafts) {
        const item = { ...draft, id: `E${evidence.length + 1}` };
        evidence.push(item);
        onEvent?.({ evidence: item, type: "evidence" });
      }
      const status = result.isError ? "failed" : "completed";
      history.push({ ...call, status });
      onEvent?.({ stage: status, tool: tool.title, type: "tool" });
    } catch {
      history.push({ ...call, status: "failed" });
      onEvent?.({ stage: "failed", tool: tool.title, type: "tool" });
    }
  }
}

async function finishAnswer(
  configuration: LlmConfiguration,
  plan: Omit<ResearchPlan, "answer" | "evidence">,
  evidence: ResearchEvidence[],
  draft: string,
  query: string,
  onEvent?: (event: ResearchHarnessEvent) => void,
): Promise<ResearchPlan> {
  const answer =
    plan.mode === "quick"
      ? draft
      : await composeVisibleAnswer(
          configuration,
          plan,
          evidence,
          draft,
          query,
          onEvent,
        );
  if (plan.mode === "quick") {
    onEvent?.({ answer, type: "answer", verified: false });
  }
  if (plan.mode !== "deep") {
    return { ...plan, answer, evidence };
  }

  onEvent?.({ phase: "verifying", type: "phase" });
  try {
    const verifiedAnswer = await verifyResearchAnswer(
      configuration,
      query,
      evidence,
      answer,
    );
    onEvent?.({ answer: verifiedAnswer, type: "answer", verified: true });
    return { ...plan, answer: verifiedAnswer, evidence };
  } catch (error) {
    if (!(error instanceof LlmError)) {
      throw error;
    }
    onEvent?.({
      message: "심층 검증을 완료하지 못해 먼저 작성된 오버뷰를 표시합니다.",
      type: "warning",
    });
    return { ...plan, answer, evidence };
  }
}

async function composeVisibleAnswer(
  configuration: LlmConfiguration,
  plan: Omit<ResearchPlan, "answer" | "evidence">,
  evidence: ResearchEvidence[],
  draft: string,
  query: string,
  onEvent?: (event: ResearchHarnessEvent) => void,
) {
  onEvent?.({ phase: "composing", type: "phase" });
  onEvent?.({
    detail: "최종 답변을 한 번에 만들지 않고 문단 단위로 생성합니다.",
    status: "running",
    title: "AI 오버뷰 작성",
    type: "progress",
  });
  try {
    const answer = await composeResearchAnswer(
      configuration,
      query,
      plan,
      evidence,
      ({ answer: partialAnswer, sectionTitle }) => {
        onEvent?.({
          detail: `${sectionTitle} 문단을 작성하는 중입니다.`,
          status: "running",
          title: "문단별 생성",
          type: "progress",
        });
        onEvent?.({
          answer: partialAnswer,
          type: "answer",
          verified: false,
        });
      },
    );
    onEvent?.({
      detail: "문단별 생성이 완료되었습니다.",
      status: "completed",
      title: "AI 오버뷰 작성",
      type: "progress",
    });
    return answer;
  } catch (error) {
    if (!(error instanceof LlmError)) {
      throw error;
    }
    onEvent?.({
      message:
        "스트리밍 답변 생성에 실패해 먼저 확보한 초안 답변을 표시합니다.",
      type: "warning",
    });
    onEvent?.({ answer: draft, type: "answer", verified: false });
    return draft;
  }
}

function createPlan(
  query: string,
  decision: AgentDecision,
): Omit<ResearchPlan, "answer" | "evidence"> {
  return {
    assumptions: decision.assumptions,
    coverageLabel: researchModeLabel(decision.mode),
    coverageLevel: decision.coverageLevel,
    hypothetical: decision.hypothetical,
    intent: decision.intent,
    legalIssues: decision.legalIssues,
    mode: decision.mode,
    query,
    steps: stepsForResearchMode(decision.mode),
  };
}

function rejectUngroundedAnswer(
  plan: Omit<ResearchPlan, "answer" | "evidence">,
  evidence: ResearchEvidence[],
  history: Array<{
    arguments: Record<string, unknown>;
    status: "completed" | "failed";
    toolKey: string;
  }>,
  answer: string,
) {
  if (plan.mode === "quick") {
    return null;
  }
  if (evidence.length === 0) {
    return "개별 법률상황 답변인데 MCP 근거가 하나도 없다. 쟁점별 도구 검색을 먼저 수행한다.";
  }
  const completedSearches = new Set(
    history
      .filter((call) => call.status === "completed")
      .map((call) => `${call.toolKey}:${JSON.stringify(call.arguments)}`),
  ).size;
  const requiredSearches = plan.hypothetical
    ? Math.min(3, Math.max(2, plan.legalIssues.length))
    : plan.mode === "deep"
      ? 2
      : 1;
  if (completedSearches < requiredSearches) {
    return `현재 서로 다른 MCP 검색은 ${completedSearches}회뿐이다. 이 질문은 답변 전에 쟁점을 나눈 검색을 최소 ${requiredSearches}회 완료해야 한다.`;
  }
  const citedIds = new Set(
    [...answer.matchAll(/\[(E\d+)\]/g)].map((match) => match[1]),
  );
  if (!evidence.some((item) => citedIds.has(item.id))) {
    return "답변에 실제 MCP 근거 ID 인용이 없다. 필요한 검색을 보완하고 근거 ID를 사실 주장에 연결한다.";
  }
  return null;
}
