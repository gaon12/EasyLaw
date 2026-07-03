import { getDatabase } from "@/lib/db";
import { probeMcpServers } from "@/lib/mcp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const db = getDatabase();
  const probes = await probeMcpServers(db);
  return Response.json({
    configured: probes.length,
    ok: probes.length > 0 && probes.every((probe) => probe.ok),
    servers: probes,
  });
}
