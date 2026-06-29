import { z } from "zod";
import { consumeRecoveryCode } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { authenticatedUser } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const recoveryRequest = z.object({
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
  const user = await authenticatedUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = consumeRecoveryCode(getDatabase(), user.id, body.data.code);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
