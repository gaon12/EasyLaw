import { z } from "zod";
import { createMagicLink } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const magicLinkRequest = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const body = magicLinkRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const result = createMagicLink(getDatabase(), body.data.email);
  if (!result.ok) {
    return Response.json(result, { status: 429 });
  }

  return Response.json({
    ok: true,
    userId: result.userId,
    devToken: process.env.NODE_ENV === "production" ? undefined : result.token,
  });
}
