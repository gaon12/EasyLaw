import { z } from "zod";
import { consumeRecoveryCode } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const recoveryRequest = z.object({
  userId: z.string().min(1),
  code: z.string().min(10).max(20),
});

export async function POST(request: Request) {
  const body = recoveryRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const result = consumeRecoveryCode(
    getDatabase(),
    body.data.userId,
    body.data.code,
  );
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
