import { cookies } from "next/headers";
import { z } from "zod";
import { CAPTCHA_LEVELS } from "@/lib/captcha";
import { getDatabase } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { setSetting } from "@/lib/settings";

const requestSchema = z.object({
  scope: z.enum(["captcha", "llm", "mcp"]),
  settings: z.record(z.string(), z.string().max(2000)),
});

const allowedKeys = {
  captcha: new Set(["captcha_level"]),
  llm: new Set([
    "llm_provider",
    "llm_api_base_url",
    "llm_model",
    "llm_api_key",
  ]),
  mcp: new Set([
    "mcp_korean_law_endpoint",
    "mcp_case_law_endpoint",
    "mcp_timeout_ms",
  ]),
};

const validators = {
  captcha_level: (value: string) =>
    CAPTCHA_LEVELS.some((level) => level === value),
};

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
    setSetting(db, key, trimmedValue, key.endsWith("_api_key"));
  }

  return Response.json({ ok: true });
}
