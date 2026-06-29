import { getDatabase } from "@/lib/db";
import { getOrCreateSetupEnrollment } from "@/lib/setup";
import { setupSessionToken } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getOrCreateSetupEnrollment(
    getDatabase(),
    await setupSessionToken(),
  );
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      { status: result.reason === "unauthorized" ? 401 : 409 },
    );
  }
  return Response.json({ ok: true, enrollment: result.enrollment });
}
