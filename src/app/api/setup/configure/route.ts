import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { configureSetup } from "@/lib/setup";
import { setupSessionToken } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  serviceName: z.string().trim().min(2).max(60),
  baseUrl: z.url(),
  adminName: z.string().trim().min(2).max(60),
  adminEmail: z.email(),
  resendApiKey: z.string().trim().min(8).max(200),
  fromEmail: z.string().trim().min(3).max(200),
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
    const result = await configureSetup(
      getDatabase(),
      await setupSessionToken(),
      input.data,
    );
    if (!result.ok) {
      return Response.json(
        { error: result.reason },
        { status: result.reason === "unauthorized" ? 401 : 409 },
      );
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "email_delivery_failed" }, { status: 502 });
  }
}
