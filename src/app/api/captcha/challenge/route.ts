import { createAltchaChallenge } from "@/lib/captcha";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const challenge = await createAltchaChallenge(getDatabase());
  if (!challenge) {
    return Response.json({ error: "captcha_disabled" }, { status: 404 });
  }

  return Response.json(challenge, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
