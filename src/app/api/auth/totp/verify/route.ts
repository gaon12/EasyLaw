import { z } from "zod";
import { verifyTotpEnrollment } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifyRequest = z.object({
  userId: z.string().min(1),
  code: z.string().min(6).max(12),
});

export async function POST(request: Request) {
  const body = verifyRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const result = await verifyTotpEnrollment(
    getDatabase(),
    body.data.userId,
    body.data.code,
  );

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
