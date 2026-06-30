import { z } from "zod";
import { verifyAltchaPayload } from "@/lib/captcha";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  payload: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "invalid_captcha" }, { status: 400 });
  }

  const verified = await verifyAltchaPayload(
    getDatabase(),
    parsed.data.payload,
  );
  if (!verified) {
    return Response.json({ error: "invalid_captcha" }, { status: 400 });
  }

  return Response.json({ ok: true });
}
