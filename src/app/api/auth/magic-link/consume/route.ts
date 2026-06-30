import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { createUserSession, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const result = consumeMagicLink(getDatabase(), token);

  if (!result.ok) {
    return NextResponse.redirect(
      new URL("/login?reason=invalid_link", request.url),
    );
  }

  const session = createUserSession(getDatabase(), result.userId);
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
