import { getAccountSecurityState } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { authenticatedUser } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await authenticatedUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const securityState = getAccountSecurityState(getDatabase(), user.id);
  if (!securityState) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json(securityState);
}
