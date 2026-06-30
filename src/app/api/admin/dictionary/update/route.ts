import { cookies } from "next/headers";
import { getDatabase } from "@/lib/db";
import { updateStandardDictionary } from "@/lib/dictionary";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (user?.role !== "super_admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await updateStandardDictionary(db);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
