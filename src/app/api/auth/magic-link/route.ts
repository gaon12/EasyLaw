import { z } from "zod";
import { createMagicLink, createSignupMagicLink } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { sendMagicLinkEmail } from "@/lib/notifications";
import { getPublicRequestOrigin } from "@/lib/request-origin";
import { optionalSafeNextPath } from "@/lib/safe-next-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const magicLinkRequest = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  email: z.string().email(),
  next: z.string().max(300).optional(),
  purpose: z.enum(["login", "signup"]).default("login"),
});

export async function POST(request: Request) {
  const body = magicLinkRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDatabase();
  const result =
    body.data.purpose === "signup" && body.data.displayName
      ? createSignupMagicLink(db, {
          displayName: body.data.displayName,
          email: body.data.email,
        })
      : createMagicLink(db, body.data.email);
  if (!result.ok) {
    return Response.json(result, { status: 429 });
  }

  const loginUrl = magicLinkUrl(request, result.token, body.data.next);
  await sendMagicLinkEmail(db, {
    email: body.data.email.trim().toLowerCase(),
    loginUrl,
  });

  return Response.json({
    ok: true,
    userId: result.userId,
  });
}

function magicLinkUrl(request: Request, token: string, nextPath?: string) {
  const url = new URL(
    "/api/auth/magic-link/consume",
    getPublicRequestOrigin(request),
  );
  url.searchParams.set("token", token);
  const safeNext = optionalSafeNextPath(nextPath);
  if (safeNext) {
    url.searchParams.set("next", safeNext);
  }
  return url.toString();
}
