import { cookies } from "next/headers";
import { z } from "zod";
import { CAPTCHA_LEVELS, isCaptchaAlgorithm } from "@/lib/captcha";
import { getDatabase } from "@/lib/db";
import {
  LLM_TIMEOUT_MAX_SECONDS,
  LLM_TIMEOUT_MIN_SECONDS,
} from "@/lib/llm-client";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { setSetting } from "@/lib/settings";

const requestSchema = z.object({
  scope: z.enum(["captcha", "easyread", "llm", "mcp", "openLaw"]),
  settings: z.record(z.string(), z.string().max(2000)),
});

const allowedKeys = {
  easyread: new Set(["easyread_review_required"]),
  captcha: new Set([
    "captcha_algorithm",
    "captcha_cost",
    "captcha_expires_minutes",
    "captcha_level",
    "captcha_min_duration_ms",
  ]),
  llm: new Set([
    "llm_provider",
    "llm_api_base_url",
    "llm_model",
    "llm_api_key",
    "llm_timeout_seconds",
  ]),
  mcp: new Set([
    "mcp_korean_law_endpoint",
    "mcp_case_law_endpoint",
    "mcp_timeout_ms",
  ]),
  openLaw: new Set(["open_law_oc", "data_go_kr_api_key"]),
};

const validators = {
  captcha_level: (value: string) =>
    CAPTCHA_LEVELS.some((level) => level === value),
  captcha_algorithm: isCaptchaAlgorithm,
  captcha_cost: (value: string) => integerInRange(value, 1, 200_000),
  captcha_expires_minutes: (value: string) => integerInRange(value, 1, 60),
  captcha_min_duration_ms: (value: string) => integerInRange(value, 0, 3000),
  llm_timeout_seconds: (value: string) =>
    integerInRange(value, LLM_TIMEOUT_MIN_SECONDS, LLM_TIMEOUT_MAX_SECONDS),
  mcp_timeout_ms: (value: string) => integerInRange(value, 1_000, 120_000),
  easyread_review_required: (value: string) => value === "0" || value === "1",
};

function integerInRange(value: string, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

export async function POST(request: Request) {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (user?.role !== "super_admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "invalid_settings" }, { status: 400 });
  }

  const allowed = allowedKeys[parsed.data.scope];
  for (const [key, value] of Object.entries(parsed.data.settings)) {
    const trimmedValue = value.trim();
    if (!allowed.has(key) || !trimmedValue) {
      continue;
    }
    if (
      key in validators &&
      !validators[key as keyof typeof validators](trimmedValue)
    ) {
      return Response.json({ error: "invalid_settings" }, { status: 400 });
    }
    setSetting(
      db,
      key,
      trimmedValue,
      key.endsWith("_api_key") || key === "open_law_oc",
    );
  }

  return Response.json({ ok: true });
}
