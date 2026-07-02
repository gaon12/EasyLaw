import { cookies } from "next/headers";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  getJudgmentCollectionProgress,
  runJudgmentCollection,
  updateJudgmentCollectionSettings,
} from "@/lib/judgment-collection";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveRequestSchema = z.object({
  action: z.literal("save"),
  settings: z.object({
    enabled: z.boolean(),
    intervalMinutes: z.coerce.number().int().min(10).max(10_080),
  }),
});

const runRequestSchema = z.object({
  action: z.literal("run"),
});

const requestSchema = z.discriminatedUnion("action", [
  saveRequestSchema,
  runRequestSchema,
]);

export async function GET() {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (user?.role !== "super_admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  return Response.json({
    ok: true,
    progress: getJudgmentCollectionProgress(db),
  });
}

export async function POST(request: Request) {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (user?.role !== "super_admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  if (parsed.data.action === "save") {
    const settings = updateJudgmentCollectionSettings(db, parsed.data.settings);
    return Response.json({ ok: true, settings });
  }

  const result = await runJudgmentCollection(db, {
    actorUserId: user.id,
    forceRefresh: true,
    trigger: "manual",
  });
  if (!result.ok && result.reason === "already_running") {
    return Response.json({ error: "already_running" }, { status: 409 });
  }
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 500 });
  }
  return Response.json({ ok: true, result });
}
