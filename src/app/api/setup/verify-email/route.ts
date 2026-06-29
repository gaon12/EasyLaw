import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { verifySetupEmail } from "@/lib/setup";
import { setupSessionToken } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json());
  if (!input.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const result = await verifySetupEmail(
    getDatabase(),
    await setupSessionToken(),
    input.data.code,
  );
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      {
        status:
          result.reason === "unauthorized"
            ? 401
            : result.reason === "rate_limited"
              ? 429
              : 400,
      },
    );
  }
  return Response.json({ ok: true, enrollment: result.enrollment });
}
