import { getDatabase } from "@/lib/db";
import { resendSetupEmail } from "@/lib/setup";
import { setupSessionToken } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await resendSetupEmail(
      getDatabase(),
      await setupSessionToken(),
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
                : 409,
        },
      );
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "email_delivery_failed" }, { status: 502 });
  }
}
