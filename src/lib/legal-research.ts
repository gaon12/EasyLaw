import type { SqliteDatabase } from "./db";
import {
  type AgentDecision,
  composeResearchAnswer,
  forceResearchAnswer,
  requestAgentDecision,
  streamDraftAnswer,
  streamGroundedRevision,
  streamQuickAnswer,
  verifyResearchAnswer,
} from "./legal-research-agent";
import {
  researchHarnessFlowchart,
  researchModeLabel,
  stepsForResearchMode,
} from "./legal-research-policy";
import { routeResearchQuery } from "./legal-research-router";
import {
  isLocalLlmConfiguration,
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

type PlanDraft = Omit<ResearchPlan, "answer" | "evidence">;

export type ResearchHarnessEvent =
  | { type: "plan"; plan: PlanDraft }
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

const OVERVIEW_EVIDENCE_LIMIT = 12;
const OVERVIEW_SEARCH_TOOL_LIMIT = 4;
const GROUNDING_HEADING = "\n\n## 근거 확인\n\n";

export function getResearchHarnessFlowchart() {
  return researchHarnessFlowchart();
}

export function isResearchHarnessConfigured(db: SqliteDatabase) {
  return readLlmConfiguration(db) !== null;
}

/**
 * answer-first 하네스. 규칙 기반 라우터가 즉시 모드를 정하고:
 * - quick: 검색 없이 바로 스트리밍.
 * - overview(기본): 초안 스트리밍을 즉시 시작하고 검색을 병렬로 돌린 뒤
 *   "근거 확인" 섹션으로 보정한다.
 * - deep(고위험): 기존 에이전트 루프 + 근거 강제 + 검증을 유지한다.
 */
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

  onEvent?.({ phase: "planning", type: "phase" });
  const route = routeResearchQuery(normalizedQuery);
  let plan: PlanDraft = {
    assumptions: [],
    coverageLabel: researchModeLabel(route.mode),
    coverageLevel: route.coverageLevel,
    hypothetical: route.hypothetical,
    intent: route.intent,
    legalIssues: route.legalIssues,
    mode: route.mode,
    query: normalizedQuery,
    steps: stepsForResearchMode(route.mode),
  };
  onEvent?.({ plan, type: "plan" });

  if (route.mode === "quick") {
    onEvent?.({ phase: "composing", type: "phase" });
    let streamed = "";
    const answer = await streamQuickAnswer(
      configuration,
      normalizedQuery,
      (token) => {
        streamed += token;
        onEvent?.({ answer: streamed, type: "answer", verified: false });
      },
    );
    onEvent?.({ answer, type: "answer", verified: false });
    return { ...plan, answer, evidence: [] };
  }

  if (route.mode === "overview") {
    return runAnswerFirstOverview(db, configuration, plan, onEvent);
  }

  return runFastFirstDeepResearch(
    db,
    configuration,
    plan,
    onEvent,
    (updated) => {
      plan = updated;
    },
  );
}

async function runFastFirstDeepResearch(
  db: SqliteDatabase,
  configuration: LlmConfiguration,
  plan: PlanDraft,
  onEvent?: (event: ResearchHarnessEvent) => void,
  onPlanUpdate?: (plan: PlanDraft) => void,
): Promise<ResearchPlan> {
  let finalAnswerStarted = false;
  let previewText = "";
  onEvent?.({ phase: "composing", type: "phase" });
  const previewPromise = streamDraftAnswer(
    configuration,
    plan.query,
    plan.intent,
    (token) => {
      if (finalAnswerStarted) {
        return;
      }
      previewText += token;
      onEvent?.({ answer: previewText, type: "answer", verified: false });
    },
  ).catch(() => {
    onEvent?.({
      message: "빠른 예비 답변 생성에 실패해 심층 검토 결과를 기다립니다.",
      type: "warning",
    });
    return "";
  });

  onEvent?.({ phase: "connecting", type: "phase" });
  try {
    const toolbox = mergeToolboxes(
      await connectMcpToolbox(db),
      createLocalLegalToolbox(db),
    );
    try {
      return await runDeepToolLoop(
        configuration,
        toolbox,
        plan,
        (event) => {
          if (event.type === "answer") {
            finalAnswerStarted = true;
          }
          onEvent?.(event);
        },
        (updated) => {
          plan = updated;
          onPlanUpdate?.(updated);
        },
      );
    } finally {
      await toolbox.close();
      await Promise.allSettled([previewPromise]);
    }
  } catch (error) {
    // 모델이 검증 하네스의 JSON 형식을 지키지 못하면 오류로 끝내지 않고
    // answer-first 오버뷰로 전환해 어떻게든 답을 준다.
    if (!(error instanceof LlmError) || error.code !== "llm_response_invalid") {
      throw error;
    }
    onEvent?.({
      message:
        "모델이 심층 검증 형식을 지키지 못해 일반 오버뷰로 전환했어요. 더 정밀한 검토가 필요하면 다른 모델로 다시 시도해 주세요.",
      type: "warning",
    });
    const fallbackPlan: PlanDraft = {
      ...plan,
      coverageLabel: researchModeLabel("overview"),
      mode: "overview",
      steps: stepsForResearchMode("overview"),
    };
    onEvent?.({ plan: fallbackPlan, type: "plan" });
    finalAnswerStarted = true;
    await Promise.allSettled([previewPromise]);
    return runAnswerFirstOverview(db, configuration, fallbackPlan, onEvent);
  }
}

/** overview: 초안 스트리밍과 병렬 검색을 동시에 시작한다. */
async function runAnswerFirstOverview(
  db: SqliteDatabase,
  configuration: LlmConfiguration,
  plan: PlanDraft,
  onEvent?: (event: ResearchHarnessEvent) => void,
): Promise<ResearchPlan> {
  onEvent?.({ phase: "composing", type: "phase" });
  let draftText = "";
  const draftPromise = streamDraftAnswer(
    configuration,
    plan.query,
    plan.intent,
    (token) => {
      draftText += token;
      onEvent?.({ answer: draftText, type: "answer", verified: false });
    },
  );
  const evidencePromise = retrieveEvidenceInParallel(db, plan.query, onEvent);

  const [draftResult, evidenceResult] = await Promise.allSettled([
    draftPromise,
    evidencePromise,
  ]);
  if (draftResult.status === "rejected") {
    throw draftResult.reason;
  }
  const draft = draftResult.value.trim();
  const evidence =
    evidenceResult.status === "fulfilled" ? evidenceResult.value : [];

  if (evidence.length === 0) {
    onEvent?.({
      message:
        "확인 가능한 법령·판례 근거를 찾지 못했어요. 일반적인 안내로만 참고해 주세요.",
      type: "warning",
    });
    onEvent?.({ answer: draft, type: "answer", verified: false });
    return { ...plan, answer: draft, evidence };
  }

  onEvent?.({ phase: "verifying", type: "phase" });
  let sectionText = "";
  try {
    const section = await streamGroundedRevision(
      configuration,
      plan.query,
      draft,
      evidence,
      (token) => {
        sectionText += token;
        onEvent?.({
          answer: `${draft}${GROUNDING_HEADING}${sectionText}`,
          type: "answer",
          verified: false,
        });
      },
    );
    const answer = `${draft}${GROUNDING_HEADING}${section.trim()}`;
    onEvent?.({ answer, type: "answer", verified: true });
    return { ...plan, answer, evidence };
  } catch (error) {
    if (!(error instanceof LlmError)) {
      throw error;
    }
    onEvent?.({
      message: "근거 확인 섹션 생성에 실패해 초안 답변만 표시합니다.",
      type: "warning",
    });
    onEvent?.({ answer: draft, type: "answer", verified: false });
    return { ...plan, answer: draft, evidence };
  }
}

/**
 * 사용자 질문을 그대로 넣을 수 있는 검색형 도구들을 병렬 호출한다.
 * LLM에게 도구 선택을 맡기지 않으므로 검색이 초안 생성과 겹쳐 돈다.
 */
async function retrieveEvidenceInParallel(
  db: SqliteDatabase,
  query: string,
  onEvent?: (event: ResearchHarnessEvent) => void,
): Promise<ResearchEvidence[]> {
  const toolbox = mergeToolboxes(
    await connectMcpToolbox(db),
    createLocalLegalToolbox(db),
  );
  try {
    const searchTools = toolbox.tools
      .filter((tool) => queryPropertyName(tool) !== null)
      .slice(0, OVERVIEW_SEARCH_TOOL_LIMIT);
    const settled = await Promise.allSettled(
      searchTools.map(async (tool) => {
        onEvent?.({ stage: "calling", tool: tool.title, type: "tool" });
        try {
          const property = queryPropertyName(tool) ?? "query";
          const result = await toolbox.call(tool.key, { [property]: query });
          onEvent?.({
            stage: result.isError ? "failed" : "completed",
            tool: tool.title,
            type: "tool",
          });
          return result.isError
            ? []
            : evidenceFromMcpResult(tool, { [property]: query }, result);
        } catch (error) {
          onEvent?.({ stage: "failed", tool: tool.title, type: "tool" });
          throw error;
        }
      }),
    );

    const evidence: ResearchEvidence[] = [];
    for (const outcome of settled) {
      if (outcome.status !== "fulfilled") {
        continue;
      }
      for (const draft of outcome.value) {
        if (evidence.length >= OVERVIEW_EVIDENCE_LIMIT) {
          break;
        }
        const item = { ...draft, id: `E${evidence.length + 1}` };
        evidence.push(item);
        onEvent?.({ evidence: item, type: "evidence" });
      }
    }
    return evidence;
  } finally {
    await toolbox.close();
  }
}

function queryPropertyName(tool: McpToolDefinition): string | null {
  const schema = tool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: unknown;
  };
  const properties = schema?.properties;
  if (!properties) {
    return null;
  }
  const candidates = ["query", "q", "keyword", "keywords", "search", "text"];
  const property = candidates.find((name) => name in properties);
  if (!property) {
    return null;
  }
  const required = Array.isArray(schema.required) ? schema.required : [];
  return required.every((name) => name === property) ? property : null;
}

/** deep: 근거 강제·검증을 유지하는 기존 에이전트 루프. 도구 호출은 병렬. */
async function runDeepToolLoop(
  configuration: LlmConfiguration,
  toolbox: McpToolbox,
  initialPlan: PlanDraft,
  onEvent?: (event: ResearchHarnessEvent) => void,
  onPlanUpdate?: (plan: PlanDraft) => void,
): Promise<ResearchPlan> {
  const evidence: ResearchEvidence[] = [];
  const history: Array<{
    arguments: Record<string, unknown>;
    status: "completed" | "failed";
    toolKey: string;
  }> = [];
  let plan = initialPlan;
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
      query: plan.query,
      reviewFeedback,
      tools: toolbox.tools,
    });
    if (iteration === 0) {
      plan = mergeDecisionIntoPlan(plan, decision);
      onPlanUpdate?.(plan);
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
        plan.query,
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

  const answer = await forceResearchAnswer(
    configuration,
    plan.query,
    plan,
    evidence,
  );
  return finishAnswer(
    configuration,
    plan,
    evidence,
    answer,
    plan.query,
    onEvent,
  );
}

function mergeDecisionIntoPlan(
  plan: PlanDraft,
  decision: AgentDecision,
): PlanDraft {
  return {
    ...plan,
    assumptions: decision.assumptions,
    hypothetical: plan.hypothetical || decision.hypothetical,
    intent: decision.intent || plan.intent,
    legalIssues:
      decision.legalIssues.length > 0 ? decision.legalIssues : plan.legalIssues,
  };
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
  // 한 결정에 담긴 검색들은 서로 독립적이므로 병렬로 실행한다.
  const settled = await Promise.all(
    calls.map(async (call) => {
      const tool = tools.find((item) => item.key === call.toolKey);
      if (!tool) {
        return {
          call,
          drafts: [] as McpEvidenceDraft[],
          status: "failed" as const,
        };
      }
      onEvent?.({ stage: "calling", tool: tool.title, type: "tool" });
      try {
        const result = await toolbox.call(call.toolKey, call.arguments);
        const drafts = result.isError
          ? []
          : evidenceFromMcpResult(tool, call.arguments, result);
        const status = result.isError
          ? ("failed" as const)
          : ("completed" as const);
        onEvent?.({ stage: status, tool: tool.title, type: "tool" });
        return { call, drafts, status };
      } catch {
        onEvent?.({ stage: "failed", tool: tool.title, type: "tool" });
        return {
          call,
          drafts: [] as McpEvidenceDraft[],
          status: "failed" as const,
        };
      }
    }),
  );

  for (const outcome of settled) {
    for (const draft of outcome.drafts) {
      const item = { ...draft, id: `E${evidence.length + 1}` };
      evidence.push(item);
      onEvent?.({ evidence: item, type: "evidence" });
    }
    history.push({ ...outcome.call, status: outcome.status });
  }
}

async function finishAnswer(
  configuration: LlmConfiguration,
  plan: PlanDraft,
  evidence: ResearchEvidence[],
  draft: string,
  query: string,
  onEvent?: (event: ResearchHarnessEvent) => void,
): Promise<ResearchPlan> {
  const shouldUseDraftAnswer = isLocalLlmConfiguration(configuration);
  const answer = shouldUseDraftAnswer
    ? draft
    : await composeVisibleAnswer(
        configuration,
        plan,
        evidence,
        draft,
        query,
        onEvent,
      );
  if (shouldUseDraftAnswer) {
    onEvent?.({ answer, type: "answer", verified: false });
  }
  if (isLocalLlmConfiguration(configuration)) {
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
  plan: PlanDraft,
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

function rejectUngroundedAnswer(
  plan: PlanDraft,
  evidence: ResearchEvidence[],
  history: Array<{
    arguments: Record<string, unknown>;
    status: "completed" | "failed";
    toolKey: string;
  }>,
  answer: string,
) {
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
    : 2;
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
