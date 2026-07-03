import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { createOrAttachGenerationJob } from "@/lib/jobs";
import { hashToken } from "@/lib/security/crypto";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dayMs = 24 * 60 * 60 * 1000;

const notifyRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = notifyRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDatabase();

  // 무제한으로 두면 임의 이메일 주소로 알림 메일을 뿌리는 릴레이가 된다.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limits = [
    { key: `notify:email:${hashToken(body.data.email)}`, limit: 5 },
    { key: `notify:ip:${hashToken(ip)}`, limit: 20 },
  ];
  for (const check of limits) {
    const result = checkRateLimit(db, check.key, check.limit, dayMs);
    if (!result.allowed) {
      return Response.json(
        {
          error: "rate_limited",
          message: "알림 신청이 너무 잦아요. 잠시 후 다시 시도해 주세요.",
          resetAt: result.resetAt,
        },
        { status: 429 },
      );
    }
  }

  const judgment = db
    .prepare<[string], { id: string }>("SELECT id FROM judgments WHERE id = ?")
    .get(id);

  if (!judgment) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const jobId = createOrAttachGenerationJob(db, id, body.data.email);
  return Response.json({ ok: true, jobId });
}
