import OpenAI, { APIError } from "openai";
import type { SqliteDatabase } from "./db";
import { getSetting } from "./settings";

/**
 * LLM 전송 계층. 모든 공급자를 OpenAI SDK + provider별 base URL로 통일한다
 * (Anthropic도 OpenAI 호환 엔드포인트 사용). 요청은 항상 스트리밍이며,
 * 토큰이 계속 오는 동안에는 끊지 않는 유휴 기반 타임아웃을 쓴다.
 */

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmConfiguration = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  totalTimeoutMs: number;
};

export type LlmRequestOptions = {
  onToken?: (token: string) => void;
};

type LlmTimeouts = {
  /** 요청 수락(헤더)까지 허용 시간 — 로컬 모델의 로딩·긴 프롬프트 처리 구간 */
  firstResponseMs: number;
  /** 응답 시작 후 첫 토큰까지 허용 시간 */
  firstChunkMs: number;
  /** 토큰 사이 무응답 허용 시간 */
  idleMs: number;
  /** 요청 전체 상한 */
  totalMs: number;
};

type TimeoutPhase = "connect" | "first_chunk" | "stalled" | "total";

class LlmTimeoutError extends Error {
  constructor(
    readonly phase: TimeoutPhase,
    readonly elapsedMs: number,
  ) {
    super(`llm_timeout:${phase}`);
    this.name = "LlmTimeoutError";
  }
}

export class LlmError extends Error {
  constructor(
    readonly code:
      | "llm_not_configured"
      | "llm_request_failed"
      | "llm_response_invalid"
      | "mcp_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export const LLM_TIMEOUT_MIN_SECONDS = 30;
export const LLM_TIMEOUT_MAX_SECONDS = 3_600;

export function readLlmConfiguration(
  db: SqliteDatabase,
): LlmConfiguration | null {
  const provider = getSetting(db, "llm_provider")?.trim();
  const baseUrl = getSetting(db, "llm_api_base_url")?.trim();
  const model = getSetting(db, "llm_model")?.trim();
  const apiKey = getSetting(db, "llm_api_key")?.trim() || null;

  if (!provider || !baseUrl || !model) {
    return null;
  }
  if (!apiKey && !isLocalProvider(provider)) {
    return null;
  }

  return {
    apiKey,
    baseUrl,
    model,
    provider,
    totalTimeoutMs: readTotalTimeoutMs(db, provider),
  };
}

function readTotalTimeoutMs(db: SqliteDatabase, provider: string) {
  const configured = Number.parseInt(
    getSetting(db, "llm_timeout_seconds") ?? "",
    10,
  );
  if (Number.isFinite(configured)) {
    const clamped = Math.min(
      Math.max(configured, LLM_TIMEOUT_MIN_SECONDS),
      LLM_TIMEOUT_MAX_SECONDS,
    );
    return clamped * 1_000;
  }
  return isLocalProvider(provider) ? 600_000 : 180_000;
}

function timeoutsFor(configuration: LlmConfiguration): LlmTimeouts {
  const local = isLocalLlmConfiguration(configuration);
  const totalMs = configuration.totalTimeoutMs;
  return {
    firstChunkMs: Math.min(local ? 300_000 : 90_000, totalMs),
    firstResponseMs: Math.min(local ? 300_000 : 60_000, totalMs),
    idleMs: Math.min(local ? 180_000 : 60_000, totalMs),
    totalMs,
  };
}

export async function requestLlmText(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  options: LlmRequestOptions = {},
): Promise<string> {
  const response = await requestText(configuration, messages, options);

  if (!response.trim()) {
    throw new LlmError("llm_response_invalid", "LLM 응답이 비어 있습니다.");
  }
  return response.trim();
}

async function requestText(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  options: LlmRequestOptions,
) {
  const timeouts = timeoutsFor(configuration);
  const startedAt = Date.now();
  const controller = new AbortController();
  let phase: TimeoutPhase = "connect";
  let phaseTimer: ReturnType<typeof setTimeout> | null = null;
  const armPhaseTimer = (nextPhase: TimeoutPhase, delayMs: number) => {
    phase = nextPhase;
    if (phaseTimer) {
      clearTimeout(phaseTimer);
    }
    phaseTimer = setTimeout(() => controller.abort(), delayMs);
  };
  const totalTimer = setTimeout(() => {
    phase = "total";
    controller.abort();
  }, timeouts.totalMs);
  const cleanup = () => {
    if (phaseTimer) {
      clearTimeout(phaseTimer);
      phaseTimer = null;
    }
    clearTimeout(totalTimer);
  };

  try {
    armPhaseTimer("connect", timeouts.firstResponseMs);
    const stream = await openChatStream(
      configuration,
      messages,
      controller.signal,
    );

    armPhaseTimer("first_chunk", timeouts.firstChunkMs);
    let result = "";
    for await (const chunk of stream) {
      armPhaseTimer("stalled", timeouts.idleMs);
      const token = chunk.choices?.[0]?.delta?.content ?? "";
      if (token) {
        result += token;
        options.onToken?.(token);
      }
    }
    return result;
  } catch (error) {
    if (error instanceof LlmError) {
      throw error;
    }
    if (controller.signal.aborted || isAbortError(error)) {
      throw new LlmError(
        "llm_request_failed",
        timeoutMessage(
          configuration,
          new LlmTimeoutError(phase, Date.now() - startedAt),
        ),
      );
    }
    if (error instanceof APIError) {
      throw requestFailed(error);
    }
    throw new LlmError(
      "llm_request_failed",
      "LLM API에 연결하지 못했습니다. API Base URL의 서버가 실행 중인지 확인해 주세요.",
    );
  } finally {
    cleanup();
  }
}

async function openChatStream(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  signal: AbortSignal,
) {
  const client = new OpenAI({
    apiKey: configuration.apiKey ?? "not-required",
    baseURL: configuration.baseUrl.replace(/\/+$/, ""),
    maxRetries: 0,
    // 타임아웃은 위의 단계별 타이머가 전담한다.
    timeout: configuration.totalTimeoutMs + 5_000,
  });
  const body = {
    messages,
    model: configuration.model,
    stream: true as const,
    temperature: 0.1,
    ...(isAnthropic(configuration.provider) ? { max_tokens: 8_192 } : {}),
  };

  try {
    return await client.chat.completions.create(
      { ...reasoningControl(configuration), ...body },
      { signal },
    );
  } catch (error) {
    // 일부 서버는 reasoning_effort를 거부한다 — 한 번은 빼고 재시도한다.
    if (
      error instanceof APIError &&
      (error.status === 400 || error.status === 422) &&
      Object.keys(reasoningControl(configuration)).length > 0
    ) {
      return client.chat.completions.create(body, { signal });
    }
    throw error;
  }
}

function timeoutMessage(
  configuration: LlmConfiguration,
  error: LlmTimeoutError,
) {
  const local = isLocalLlmConfiguration(configuration);
  const totalSeconds = Math.round(configuration.totalTimeoutMs / 1_000);
  const elapsed = `${Math.round(error.elapsedMs / 1_000)}초`;
  const detail: Record<TimeoutPhase, string> = {
    connect: `LLM 서버가 ${elapsed} 동안 응답을 시작하지 않았습니다.${
      local
        ? " 모델 로딩 또는 긴 프롬프트 처리 중일 수 있어요. 더 작은 모델을 쓰거나 관리자 설정에서 응답 제한 시간을 늘려 주세요."
        : ` API Base URL(${configuration.baseUrl})의 서버가 실행 중인지 확인해 주세요.`
    }`,
    first_chunk: `LLM 서버에 연결됐지만 ${elapsed} 동안 첫 응답 토큰이 오지 않았습니다.${
      local
        ? " 모델 로딩 또는 긴 프롬프트 처리 중일 수 있어요."
        : " 모델명이 올바른지, 서비스 상태 페이지에 장애가 없는지 확인해 주세요."
    }`,
    stalled: `LLM 응답이 도중에 ${elapsed} 동안 멈췄습니다. 서버 자원이 부족하거나 연결이 끊겼을 수 있어요. 다시 시도해 주세요.`,
    total: `LLM 응답이 제한 시간 ${totalSeconds}초를 넘었습니다.${
      local
        ? " 로컬 모델은 답변 생성이 오래 걸릴 수 있어요. 관리자 설정의 '응답 제한 시간'을 늘리거나 더 작은 모델로 바꿔 주세요."
        : " 잠시 후 다시 시도해 주세요."
    }`,
  };
  return detail[error.phase];
}

function requestFailed(error: APIError) {
  const status = error.status ?? 0;
  const body = safeErrorBody(error);
  const suffix = body ? ` 응답: ${body.slice(0, 240)}` : "";
  if (status === 401 || status === 403) {
    return new LlmError(
      "llm_request_failed",
      `LLM API 인증이 거부되었습니다(${status}). API 키와 provider 설정을 확인해 주세요.${suffix}`,
    );
  }
  if (status === 404) {
    return new LlmError(
      "llm_request_failed",
      `LLM API 경로 또는 모델을 찾지 못했습니다(404). API Base URL과 모델명을 확인해 주세요.${suffix}`,
    );
  }
  if (status === 400 || status === 422) {
    return new LlmError(
      "llm_request_failed",
      `LLM API가 요청 형식을 거부했습니다(${status}). 모델이 OpenAI 호환 chat/completions 형식을 지원하는지 확인해 주세요.${suffix}`,
    );
  }
  if (status === 429) {
    return new LlmError(
      "llm_request_failed",
      `LLM API 사용량 제한에 걸렸습니다(429). 잠시 후 다시 시도해 주세요.${suffix}`,
    );
  }
  return new LlmError(
    "llm_request_failed",
    `LLM API가 ${status} 상태를 반환했습니다.${suffix}`,
  );
}

function safeErrorBody(error: APIError) {
  try {
    if (typeof error.error === "string") {
      return error.error;
    }
    if (error.error) {
      return JSON.stringify(error.error);
    }
    return error.message ?? "";
  } catch {
    return "";
  }
}

function reasoningControl(configuration: LlmConfiguration): {
  reasoning_effort?: "none";
} {
  if (isOllama(configuration.provider)) {
    return { reasoning_effort: "none" };
  }
  if (canDisableGeminiThinking(configuration)) {
    return { reasoning_effort: "none" };
  }
  return {};
}

function isAnthropic(provider: string) {
  return provider.trim().toLowerCase() === "anthropic";
}

function isOllama(provider: string) {
  return provider.trim().toLowerCase() === "ollama";
}

function isLocalProvider(provider: string) {
  const normalized = provider.trim().toLowerCase();
  return normalized === "ollama" || normalized === "lm studio";
}

export function isLocalLlmConfiguration(configuration: LlmConfiguration) {
  return isLocalProvider(configuration.provider);
}

function canDisableGeminiThinking(configuration: LlmConfiguration) {
  const provider = configuration.provider.trim().toLowerCase();
  const model = configuration.model.trim().toLowerCase();
  return (
    provider === "google" &&
    model.includes("gemini-2.5") &&
    !model.includes("pro")
  );
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "APIUserAbortError" ||
      error.name === "TimeoutError")
  );
}
