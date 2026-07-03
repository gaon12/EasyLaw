import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/db";
import { handleMcpRequest } from "@/lib/mcp-server";
import { hashToken } from "@/lib/security/crypto";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hourMs = 60 * 60 * 1000;

/**
 * EasyLaw 법률 코퍼스 MCP 엔드포인트 (Streamable HTTP, stateless).
 * 외부 MCP 클라이언트는 이 URL을 그대로 서버 주소로 등록하면 된다.
 */
export async function POST(request: NextRequest) {
  const db = getDatabase();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limit = checkRateLimit(db, `mcp:ip:${hashToken(ip)}`, 300, hourMs);
  if (!limit.allowed) {
    return Response.json(
      {
        error: { code: -32000, message: "요청 한도를 넘었습니다." },
        id: null,
        jsonrpc: "2.0",
      },
      { status: 429 },
    );
  }

  const payload = await request.json().catch(() => null);
  const response = await handleMcpRequest(db, payload);
  if (response.kind === "empty") {
    return new Response(null, { status: response.status });
  }
  return Response.json(response.body, { status: response.status });
}

export function GET() {
  // 서버-발신 SSE 스트림은 제공하지 않는다(스펙상 405 허용).
  return new Response(null, { headers: { Allow: "POST" }, status: 405 });
}

export function DELETE() {
  // stateless 서버라 종료할 세션이 없다.
  return new Response(null, { status: 405 });
}
