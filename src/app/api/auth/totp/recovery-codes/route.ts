import { regenerateRecoveryCodes } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { authenticatedUser } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await authenticatedUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = regenerateRecoveryCodes(getDatabase(), user.id);
  if (!result.ok) {
    return Response.json(result, {
      status: result.reason === "totp_not_enabled" ? 409 : 404,
    });
  }

  return Response.json(result);
}
