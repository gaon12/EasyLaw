import type { SqliteDatabase } from "./db";
import { getSetting } from "./settings";

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

type OpenAiCompatibleRequestBody = {
  messages: LlmMessage[];
  model: string;
  reasoning_effort?: "none";
  stream: true;
  temperature: number;
};

type LlmTimeouts = {
  /** 헤더(연결) 수신까지 허용 시간 */
  connectMs: number;
  /** 헤더 수신 후 첫 데이터 청크까지 허용 시간 (로컬 모델의 프롬프트 처리·모델 로딩 구간) */
  firstChunkMs: number;
  /** 데이터 청크 사이 무응답 허용 시간 */
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
    connectMs: Math.min(local ? 60_000 : 20_000, totalMs),
    firstChunkMs: Math.min(local ? 300_000 : 90_000, totalMs),
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
  try {
    return await (isAnthropic(configuration.provider)
      ? requestAnthropicStream(configuration, messages, options.onToken)
      : requestOpenAiCompatibleStream(
          configuration,
          messages,
          options.onToken,
        ));
  } catch (error) {
    if (error instanceof LlmError) {
      throw error;
    }
    if (error instanceof LlmTimeoutError || isAbortError(error)) {
      throw new LlmError(
        "llm_request_failed",
        timeoutMessage(configuration, error),
      );
    }
    throw new LlmError(
      "llm_request_failed",
      "LLM API에 연결하지 못했습니다. API Base URL의 서버가 실행 중인지 확인해 주세요.",
    );
  }
}

function timeoutMessage(configuration: LlmConfiguration, error: unknown) {
  const local = isLocalLlmConfiguration(configuration);
  const totalSeconds = Math.round(configuration.totalTimeoutMs / 1_000);
  const phase = error instanceof LlmTimeoutError ? error.phase : "total";
  const elapsed =
    error instanceof LlmTimeoutError
      ? `${Math.round(error.elapsedMs / 1_000)}초`
      : `${totalSeconds}초`;
  const detail: Record<TimeoutPhase, string> = {
    connect: `LLM 서버가 ${elapsed} 동안 연결에 응답하지 않았습니다. API Base URL(${configuration.baseUrl})의 서버가 실행 중인지 확인해 주세요.`,
    first_chunk: `LLM 서버에 연결됐지만 ${elapsed} 동안 첫 응답 토큰이 오지 않았습니다.${
      local
        ? " 모델 로딩 또는 긴 프롬프트 처리 중일 수 있어요. 더 작은 모델을 쓰거나 관리자 설정에서 응답 제한 시간을 늘려 주세요."
        : " 모델명이 올바른지, 서비스 상태 페이지에 장애가 없는지 확인해 주세요."
    }`,
    stalled: `LLM 응답이 도중에 ${elapsed} 동안 멈췄습니다. 서버 자원이 부족하거나 연결이 끊겼을 수 있어요. 다시 시도해 주세요.`,
    total: `LLM 응답이 제한 시간 ${totalSeconds}초를 넘었습니다.${
      local
        ? " 로컬 모델은 답변 생성이 오래 걸릴 수 있어요. 관리자 설정의 '응답 제한 시간'을 늘리거나 더 작은 모델로 바꿔 주세요."
        : " 잠시 후 다시 시도해 주세요."
    }`,
  };
  return detail[phase];
}

async function requestOpenAiCompatibleStream(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  onToken?: (token: string) => void,
) {
  const timeouts = timeoutsFor(configuration);
  let attempt = await streamOpenAiCompatible(
    configuration,
    messages,
    timeouts,
    {
      skipReasoningControl: false,
    },
  );
  if (
    attempt.type === "http_error" &&
    shouldRetryWithoutReasoning(attempt.status)
  ) {
    attempt = await streamOpenAiCompatible(configuration, messages, timeouts, {
      skipReasoningControl: true,
    });
  }
  if (attempt.type === "http_error") {
    throw await requestFailed(attempt.response);
  }

  let result = "";
  await readSse(attempt.stream, (data) => {
    if (data === "[DONE]") {
      return;
    }
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    const token = parsed.choices?.[0]?.delta?.content ?? "";
    if (token) {
      result += token;
      onToken?.(token);
    }
  });
  return result;
}

type StreamAttempt =
  | { type: "stream"; stream: TimedSseStream }
  | { type: "http_error"; status: number; response: Response };

async function streamOpenAiCompatible(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  timeouts: LlmTimeouts,
  options: { skipReasoningControl: boolean },
): Promise<StreamAttempt> {
  const body: OpenAiCompatibleRequestBody = {
    ...(options.skipReasoningControl ? {} : reasoningControl(configuration)),
    messages,
    model: configuration.model,
    stream: true,
    temperature: 0.1,
  };
  return openTimedStream(
    new URL("chat/completions", ensureTrailingSlash(configuration.baseUrl)),
    {
      body: JSON.stringify(body),
      headers: {
        ...(configuration.apiKey
          ? { Authorization: `Bearer ${configuration.apiKey}` }
          : {}),
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    timeouts,
  );
}

async function requestAnthropicStream(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  onToken?: (token: string) => void,
) {
  const timeouts = timeoutsFor(configuration);
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      content: message.content,
      role: message.role,
    }));
  const attempt = await openTimedStream(
    new URL("messages", ensureTrailingSlash(configuration.baseUrl)),
    {
      body: JSON.stringify({
        max_tokens: 4_096,
        messages: conversation,
        model: configuration.model,
        stream: true,
        system,
        temperature: 0.1,
      }),
      headers: {
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "x-api-key": configuration.apiKey ?? "",
      },
      method: "POST",
    },
    timeouts,
  );
  if (attempt.type === "http_error") {
    throw await requestFailed(attempt.response);
  }

  let result = "";
  await readSse(attempt.stream, (data) => {
    const parsed = JSON.parse(data) as {
      delta?: { text?: string; type?: string };
      type?: string;
    };
    const token =
      parsed.type === "content_block_delta" &&
      parsed.delta?.type === "text_delta"
        ? (parsed.delta.text ?? "")
        : "";
    if (token) {
      result += token;
      onToken?.(token);
    }
  });
  return result;
}

/**
 * 청크가 도착하는 동안에는 계속 기다리는 유휴 기반 타임아웃 스트림.
 * 로컬 LLM처럼 총 생성 시간이 긴 경우에도, 서버가 살아 있는 한 끊지 않는다.
 */
type TimedSseStream = {
  read(): Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel(): void;
};

async function openTimedStream(
  url: URL,
  init: RequestInit,
  timeouts: LlmTimeouts,
): Promise<StreamAttempt> {
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
  const timeoutError = () => new LlmTimeoutError(phase, Date.now() - startedAt);

  armPhaseTimer("connect", timeouts.connectMs);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    cleanup();
    throw controller.signal.aborted ? timeoutError() : error;
  }

  if (!response.ok) {
    cleanup();
    return { response, status: response.status, type: "http_error" };
  }
  if (!response.body) {
    cleanup();
    throw new LlmError(
      "llm_response_invalid",
      "LLM 스트리밍 응답 본문이 비어 있습니다.",
    );
  }

  const reader = response.body.getReader();
  armPhaseTimer("first_chunk", timeouts.firstChunkMs);
  let receivedFirstChunk = false;

  return {
    type: "stream",
    stream: {
      async read() {
        try {
          const result = await reader.read();
          if (result.done) {
            cleanup();
          } else {
            if (!receivedFirstChunk) {
              receivedFirstChunk = true;
            }
            armPhaseTimer("stalled", timeouts.idleMs);
          }
          return result;
        } catch (error) {
          cleanup();
          throw controller.signal.aborted ? timeoutError() : error;
        }
      },
      cancel() {
        cleanup();
        void reader.cancel().catch(() => {});
      },
    },
  };
}

async function requestFailed(response: Response) {
  const status = response.status;
  const body = await response.text().catch(() => "");
  const suffix = body.trim() ? ` 응답: ${body.trim().slice(0, 240)}` : "";
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

async function readSse(stream: TimedSseStream, onData: (data: string) => void) {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice("data:".length).trimStart())
          .join("\n")
          .trim();
        if (data) {
          onData(data);
        }
      }
    }
  } finally {
    stream.cancel();
  }
}

function isAnthropic(provider: string) {
  return provider.trim().toLowerCase() === "anthropic";
}

function reasoningControl(
  configuration: LlmConfiguration,
): Pick<OpenAiCompatibleRequestBody, "reasoning_effort"> {
  if (isOllama(configuration.provider)) {
    return { reasoning_effort: "none" };
  }
  if (canDisableGeminiThinking(configuration)) {
    return { reasoning_effort: "none" };
  }
  return {};
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

function shouldRetryWithoutReasoning(status: number) {
  return status === 400 || status === 422;
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
