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
};

export type LlmRequestOptions = {
  onToken?: (token: string) => void;
};

type OpenAiCompatibleRequestBody = {
  messages: LlmMessage[];
  model: string;
  reasoning_effort?: "none";
  stream?: true;
  temperature: number;
};

type OpenAiCompatibleOptions = {
  skipReasoningControl?: boolean;
  stream?: true;
  timeoutMs: number;
};

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

  return { apiKey, baseUrl, model, provider };
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
    if (options.onToken) {
      return await (isAnthropic(configuration.provider)
        ? requestAnthropicStream(configuration, messages, options.onToken)
        : requestOpenAiCompatibleStream(
            configuration,
            messages,
            options.onToken,
          ));
    }
    return await (isAnthropic(configuration.provider)
      ? requestAnthropic(configuration, messages)
      : requestOpenAiCompatible(configuration, messages));
  } catch (error) {
    if (error instanceof LlmError) {
      throw error;
    }
    if (isTimeoutError(error)) {
      throw new LlmError(
        "llm_request_failed",
        "LLM API 응답 시간이 초과되었습니다. 로컬 모델이 아직 추론 중이거나 서버가 응답하지 않았습니다.",
      );
    }
    throw new LlmError(
      "llm_request_failed",
      "LLM API에 연결하지 못했습니다. API Base URL의 서버가 실행 중인지 확인해 주세요.",
    );
  }
}

async function requestOpenAiCompatible(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
) {
  let response = await fetchOpenAiCompatible(configuration, messages, {
    timeoutMs: requestTimeoutMs(configuration, false),
  });
  if (!response.ok && shouldRetryWithoutReasoning(response.status)) {
    response = await fetchOpenAiCompatible(configuration, messages, {
      skipReasoningControl: true,
      timeoutMs: requestTimeoutMs(configuration, false),
    });
  }

  if (!response.ok) {
    throw await requestFailed(response);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content ?? "";
}

async function requestOpenAiCompatibleStream(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  onToken: (token: string) => void,
) {
  let response = await fetchOpenAiCompatible(configuration, messages, {
    stream: true,
    timeoutMs: requestTimeoutMs(configuration, true),
  });
  if (!response.ok && shouldRetryWithoutReasoning(response.status)) {
    response = await fetchOpenAiCompatible(configuration, messages, {
      skipReasoningControl: true,
      stream: true,
      timeoutMs: requestTimeoutMs(configuration, true),
    });
  }

  if (!response.ok) {
    throw await requestFailed(response);
  }
  if (!response.body) {
    throw new LlmError(
      "llm_response_invalid",
      "LLM 스트리밍 응답 본문이 비어 있습니다.",
    );
  }

  let result = "";
  await readSse(response.body, (data) => {
    if (data === "[DONE]") {
      return;
    }
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    const token = parsed.choices?.[0]?.delta?.content ?? "";
    if (token) {
      result += token;
      onToken(token);
    }
  });
  return result;
}

async function requestAnthropic(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
) {
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
  const response = await fetch(
    new URL("messages", ensureTrailingSlash(configuration.baseUrl)),
    {
      body: JSON.stringify({
        max_tokens: 4_096,
        messages: conversation,
        model: configuration.model,
        system,
        temperature: 0.1,
      }),
      headers: {
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "x-api-key": configuration.apiKey ?? "",
      },
      method: "POST",
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!response.ok) {
    throw await requestFailed(response);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return (
    payload.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n") ?? ""
  );
}

async function requestAnthropicStream(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  onToken: (token: string) => void,
) {
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
  const response = await fetch(
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
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!response.ok) {
    throw await requestFailed(response);
  }
  if (!response.body) {
    throw new LlmError(
      "llm_response_invalid",
      "LLM 스트리밍 응답 본문이 비어 있습니다.",
    );
  }

  let result = "";
  await readSse(response.body, (data) => {
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
      onToken(token);
    }
  });
  return result;
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

async function readSse(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
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
}

function isAnthropic(provider: string) {
  return provider.trim().toLowerCase() === "anthropic";
}

function fetchOpenAiCompatible(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  options: OpenAiCompatibleOptions,
) {
  return fetch(
    new URL("chat/completions", ensureTrailingSlash(configuration.baseUrl)),
    {
      body: JSON.stringify(
        openAiCompatibleBody(configuration, messages, options),
      ),
      headers: {
        ...(configuration.apiKey
          ? { Authorization: `Bearer ${configuration.apiKey}` }
          : {}),
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs),
    },
  );
}

function openAiCompatibleBody(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
  options: Pick<
    OpenAiCompatibleOptions,
    "skipReasoningControl" | "stream"
  > = {},
): OpenAiCompatibleRequestBody {
  return {
    ...(options.skipReasoningControl ? {} : reasoningControl(configuration)),
    messages,
    model: configuration.model,
    ...(options.stream ? { stream: true as const } : {}),
    temperature: 0.1,
  };
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

function isTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function requestTimeoutMs(configuration: LlmConfiguration, stream: boolean) {
  if (isLocalLlmConfiguration(configuration)) {
    return stream ? 240_000 : 180_000;
  }
  return stream ? 60_000 : 45_000;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
