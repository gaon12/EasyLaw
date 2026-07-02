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
): Promise<string> {
  const response = isAnthropic(configuration.provider)
    ? await requestAnthropic(configuration, messages)
    : await requestOpenAiCompatible(configuration, messages);

  if (!response.trim()) {
    throw new LlmError("llm_response_invalid", "LLM 응답이 비어 있습니다.");
  }
  return response.trim();
}

async function requestOpenAiCompatible(
  configuration: LlmConfiguration,
  messages: LlmMessage[],
) {
  const response = await fetch(
    new URL("chat/completions", ensureTrailingSlash(configuration.baseUrl)),
    {
      body: JSON.stringify({
        messages,
        model: configuration.model,
        temperature: 0.1,
      }),
      headers: {
        ...(configuration.apiKey
          ? { Authorization: `Bearer ${configuration.apiKey}` }
          : {}),
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!response.ok) {
    throw requestFailed(response.status);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content ?? "";
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
    throw requestFailed(response.status);
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

function requestFailed(status: number) {
  return new LlmError(
    "llm_request_failed",
    `LLM API가 ${status} 상태를 반환했습니다.`,
  );
}

function isAnthropic(provider: string) {
  return provider.trim().toLowerCase() === "anthropic";
}

function isLocalProvider(provider: string) {
  const normalized = provider.trim().toLowerCase();
  return normalized === "ollama" || normalized === "lm studio";
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
