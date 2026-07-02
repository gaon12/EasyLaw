export const LLM_PRESETS = [
  {
    baseUrl: "https://api.openai.com/v1",
    key: "openai",
    label: "OpenAI",
    model: "gpt-5-mini",
    provider: "OpenAI",
  },
  {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    key: "google",
    label: "Google",
    model: "gemini-3.5-flash",
    provider: "Google",
  },
  {
    baseUrl: "https://api.anthropic.com/v1",
    key: "anthropic",
    label: "Anthropic",
    model: "claude-sonnet-5",
    provider: "Anthropic",
  },
  {
    baseUrl: "https://api.x.ai/v1",
    key: "xai",
    label: "xAI",
    model: "grok-4.3",
    provider: "xAI",
  },
  {
    baseUrl: "https://openrouter.ai/api/v1",
    key: "openrouter",
    label: "OpenRouter",
    model: "~openai/gpt-latest",
    provider: "OpenRouter",
  },
  {
    baseUrl: "http://localhost:11434/v1",
    key: "ollama",
    label: "Ollama",
    model: "gpt-oss:20b",
    provider: "Ollama",
  },
  {
    baseUrl: "http://localhost:1234/v1",
    key: "lmstudio",
    label: "LM Studio",
    model: "local-model",
    provider: "LM Studio",
  },
] as const;

export const DEFAULT_LLM_PRESET = LLM_PRESETS[0];

export type LlmPresetKey = (typeof LLM_PRESETS)[number]["key"] | "custom";

export function detectLlmPreset({
  baseUrl,
  model,
  provider,
}: {
  baseUrl: string;
  model: string;
  provider: string;
}): LlmPresetKey {
  const normalizedBaseUrl = normalizeUrl(baseUrl);
  const preset = LLM_PRESETS.find(
    (item) =>
      item.provider === provider &&
      normalizeUrl(item.baseUrl) === normalizedBaseUrl &&
      item.model === model,
  );
  return preset?.key ?? "custom";
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
