import { z } from "zod";
import { verifyTotpEnrollment } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { authenticatedUser } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifyRequest = z.object({
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
  const user = await authenticatedUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await verifyTotpEnrollment(
    getDatabase(),
    user.id,
    body.data.code,
  );

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
