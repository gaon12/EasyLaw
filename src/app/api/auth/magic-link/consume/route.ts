import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import {
  createLoginChallenge,
  LOGIN_CHALLENGE_COOKIE,
} from "@/lib/login-challenge";
import { getPublicRequestOrigin } from "@/lib/request-origin";
import {
  createUserSession,
  getSessionUser,
  SESSION_COOKIE,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const db = getDatabase();
  const result = consumeMagicLink(db, token);
  const publicOrigin = getPublicRequestOrigin(request);

  if (!result.ok) {
    const sessionUser = getSessionUser(
      db,
      request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
        ?.slice(SESSION_COOKIE.length + 1),
    );
    if (sessionUser) {
      return NextResponse.redirect(new URL("/", publicOrigin));
    }
    return NextResponse.redirect(
      new URL("/login?reason=invalid_link", publicOrigin),
    );
  }

  if (result.requiresTotp) {
    const challenge = createLoginChallenge(db, result.userId);
    const challengeUrl = new URL("/login/2fa", publicOrigin);
    if (nextPath !== "/") {
      challengeUrl.searchParams.set("next", nextPath);
    }
    const response = NextResponse.redirect(challengeUrl);
    response.cookies.set({
      expires: new Date(challenge.expiresAt),
      httpOnly: true,
      name: LOGIN_CHALLENGE_COOKIE,
      path: "/",
      sameSite: "lax",
      secure: isSecureRequest(request),
      value: challenge.token,
    });
    return response;
  }

  const session = createUserSession(db, result.userId);
  const response = NextResponse.redirect(new URL(nextPath, publicOrigin));
  response.cookies.set({
    expires: new Date(session.expiresAt),
    httpOnly: true,
    name: SESSION_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(request),
    value: session.token,
  });
  return response;
}

function isSecureRequest(request: Request) {
  return (
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:"
  );
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
