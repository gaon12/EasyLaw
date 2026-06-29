import { getDatabase } from "@/lib/db";
import { getSetupStatus } from "@/lib/setup";
import { setupSessionToken } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    getSetupStatus(getDatabase(), await setupSessionToken()),
  );
}
