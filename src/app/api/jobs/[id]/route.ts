import { cookies } from "next/headers";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { processGenerationJob } from "@/lib/easyread-generation";
import { failGenerationJob } from "@/lib/jobs";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jobActionRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("fail"), reason: z.string().min(1).max(300) }),
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDatabase();
  const job = db
    .prepare<
      [string],
      {
        id: string;
        judgment_id: string;
        status: string;
        attempts: number;
        failure_reason: string | null;
        completed_at: string | null;
      }
    >(
      `SELECT id, judgment_id, status, attempts, failure_reason, completed_at
        FROM judgment_generation_jobs
        WHERE id = ?`,
    )
    .get(id);

  if (!job) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json({ job });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = getDatabase();
  // 작업 상태 전환은 이메일 발송까지 유발하므로 운영자만 가능하다.
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = jobActionRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  if (body.data.action === "complete") {
    const result = await processGenerationJob(db, id);
    if (!result.ok) {
      return Response.json(
        { error: result.reason, message: result.message ?? null },
        { status: result.reason === "job_not_found" ? 404 : 502 },
      );
    }
  } else {
    failGenerationJob(db, id, body.data.reason);
  }

  return Response.json({ ok: true });
}
