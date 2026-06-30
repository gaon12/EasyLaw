import { cookies } from "next/headers";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { setSetting } from "@/lib/settings";

const requestSchema = z.object({
  scope: z.enum(["llm", "mcp"]),
  settings: z.record(z.string(), z.string().max(2000)),
});

const allowedKeys = {
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
    setSetting(db, key, trimmedValue, key.endsWith("_api_key"));
  }

  return Response.json({ ok: true });
}
