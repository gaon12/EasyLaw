import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  completeLoginChallenge,
  LOGIN_CHALLENGE_COOKIE,
} from "@/lib/login-challenge";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifyRequest = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  const body = verifyRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const result = await completeLoginChallenge(
    getDatabase(),
    cookieStore.get(LOGIN_CHALLENGE_COOKIE)?.value,
    body.data.code,
  );
  if (!result.ok) {
    const status =
      result.reason === "rate_limited"
        ? 429
        : result.reason === "invalid_challenge"
          ? 401
          : result.reason === "totp_not_enrolled"
            ? 409
            : 400;
    return Response.json(result, { status });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    expires: new Date(result.session.expiresAt),
    httpOnly: true,
    name: SESSION_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(request),
    value: result.session.token,
  });
  response.cookies.set({
    expires: new Date(0),
    httpOnly: true,
    name: LOGIN_CHALLENGE_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(request),
    value: "",
  });
  return response;
}

function isSecureRequest(request: Request) {
  return (
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:"
  );
}
