import { cookies } from "next/headers";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { newId } from "@/lib/security/crypto";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { nowIso } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  title: z.string().trim().min(2).max(120),
  text: z.string().trim().min(20).max(500_000),
});

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json());
  if (!input.success) {
    return Response.json(
      { error: "invalid_request", details: input.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = newId("cp");
  const now = nowIso();
  db.prepare(
    `INSERT INTO judgments
      (id, case_number, court_name, decided_on, title, case_type, status,
       visibility, source_provider, source_external_id, source_trust,
       original_text, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'custom', 'pending', 'private', 'user-paste',
       ?, 'user_uploaded', ?, ?, ?, ?)`,
  ).run(
    id,
    "사용자 입력",
    "직접 입력",
    now.slice(0, 10),
    input.data.title,
    id,
    input.data.text,
    user.id,
    now,
    now,
  );

  return Response.json({ id, href: `/cp/${encodeURIComponent(id)}` });
}
