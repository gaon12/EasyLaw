import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
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
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.redirect(
      new URL("/login?reason=invalid_link", request.url),
    );
  }

  const session = createUserSession(db, result.userId);
  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  response.cookies.set({
    expires: new Date(session.expiresAt),
    httpOnly: true,
    name: SESSION_COOKIE,
    path: "/",
    sameSite: "lax",
    secure:
      forwardedProtocol === "https" ||
      new URL(request.url).protocol === "https:",
    value: session.token,
  });
  return response;
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
