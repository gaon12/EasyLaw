import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  approveGenerationJob,
  rejectGenerationJob,
  requeueGenerationJob,
} from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewActionRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("reject"),
    reason: z.string().trim().min(1).max(300),
  }),
  z.object({ action: z.literal("requeue") }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const body = reviewActionRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDatabase();
  const ok =
    body.data.action === "approve"
      ? await approveGenerationJob(db, jobId)
      : body.data.action === "reject"
        ? rejectGenerationJob(db, jobId, body.data.reason)
        : requeueGenerationJob(db, jobId);

  if (!ok) {
    return Response.json(
      {
        error: "invalid_state",
        message: "해당 상태에서 처리할 수 없는 작업입니다.",
      },
      { status: 409 },
    );
  }
  return Response.json({ ok: true });
}
