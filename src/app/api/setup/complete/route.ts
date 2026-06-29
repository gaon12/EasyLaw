import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";
import { completeSetup } from "@/lib/setup";
import { setupSessionToken } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  code: z.string().trim().min(6).max(12),
});

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json());
  if (!input.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const result = await completeSetup(
    getDatabase(),
    await setupSessionToken(),
    input.data.code,
  );
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      {
        status:
          result.reason === "unauthorized"
            ? 401
            : result.reason === "rate_limited"
              ? 429
              : 400,
      },
    );
  }
  const response = NextResponse.json({
    ok: true,
    recoveryCodes: result.recoveryCodes,
  });
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  response.cookies.set({
    name: SESSION_COOKIE,
    value: result.session.token,
    httpOnly: true,
    sameSite: "lax",
    secure:
      forwardedProtocol === "https" ||
      new URL(request.url).protocol === "https:",
    path: "/",
    expires: new Date(result.session.expiresAt),
  });
  return response;
}
