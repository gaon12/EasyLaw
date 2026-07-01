import { z } from "zod";
import { disableTotp } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { authenticatedUser } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const disableRequest = z.object({
  code: z.string().min(6).max(12),
});

export async function DELETE(request: Request) {
  const body = disableRequest.safeParse(await request.json());
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

  const result = await disableTotp(getDatabase(), user.id, body.data.code);
  if (!result.ok) {
    const status =
      result.reason === "totp_required"
        ? 403
        : result.reason === "not_found"
          ? 404
          : result.reason === "rate_limited"
            ? 429
            : 400;
    return Response.json(result, { status });
  }

  return Response.json(result);
}
