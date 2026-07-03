import { cookies } from "next/headers";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  getJudgmentCollectionProgress,
  startJudgmentCollection,
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

  // 최초 전체 수집은 수 시간이 걸릴 수 있어 요청에 묶지 않는다.
  // 백그라운드로 시작하고 즉시 응답하며, 진행 상황은 GET 폴링으로 확인한다.
  const started = startJudgmentCollection(db, {
    actorUserId: user.id,
    forceRefresh: true,
    trigger: "manual",
  });
  if (!started.ok) {
    return Response.json({ error: "already_running" }, { status: 409 });
  }
  return Response.json(
    { ok: true, resumed: started.resumed, runId: started.runId, started: true },
    { status: 202 },
  );
}
