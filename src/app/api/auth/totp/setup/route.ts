import { createTotpEnrollment } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { authenticatedUser } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await authenticatedUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const enrollment = await createTotpEnrollment(getDatabase(), user.id);
  return Response.json(enrollment);
}
