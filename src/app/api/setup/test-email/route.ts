import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { testSetupEmailConfiguration } from "@/lib/setup";
import { setupSessionToken } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  adminEmail: z.email(),
  resendApiKey: z.string().trim().min(8).max(200),
  fromName: z.string().trim().min(1).max(60),
  fromAddress: z.email(),
});

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json());
  if (!input.success) {
    return Response.json(
      { error: "invalid_request", details: input.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await testSetupEmailConfiguration(
      getDatabase(),
      await setupSessionToken(),
      input.data,
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
                : result.reason === "email_test_failed"
                  ? 400
                  : 409,
        },
      );
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "email_test_failed" }, { status: 400 });
  }
}
