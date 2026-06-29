import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { SETUP_COOKIE, unlockSetup } from "@/lib/setup";
import { requestRateKey } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  code: z.string().min(8).max(32),
});

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json());
  if (!input.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = unlockSetup(
    getDatabase(),
    input.data.code,
    requestRateKey(request),
  );
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      { status: result.reason === "rate_limited" ? 429 : 401 },
    );
  }

  const response = NextResponse.json({ ok: true, status: result.status });
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const secure =
    forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
  response.cookies.set({
    name: SETUP_COOKIE,
    value: result.sessionToken,
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    expires: new Date(result.expiresAt),
  });
  return response;
}
