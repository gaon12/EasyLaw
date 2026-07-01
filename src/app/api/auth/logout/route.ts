import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { revokeUserSession, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  revokeUserSession(getDatabase(), token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    expires: new Date(0),
    httpOnly: true,
    name: SESSION_COOKIE,
    path: "/",
    sameSite: "lax",
    secure:
      request.headers.get("x-forwarded-proto") === "https" ||
      new URL(request.url).protocol === "https:",
    value: "",
  });
  return response;
}
