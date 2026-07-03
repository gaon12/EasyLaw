import { cookies } from "next/headers";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { getDatabase } from "@/lib/db";
import { isOrganizationMember } from "@/lib/organizations";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { nowIso } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const shareRequest = z.object({
  organizationId: z.string().trim().min(1).max(80).nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = shareRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const { id } = await params;
  // 공유 설정은 문서를 만든 본인만 바꿀 수 있다.
  const judgment = db
    .prepare<[string, string], { id: string; visibility: string }>(
      `SELECT id, visibility
        FROM judgments
        WHERE id = ?
          AND created_by_user_id = ?
          AND visibility IN ('private', 'organization')`,
    )
    .get(id, user.id);
  if (!judgment) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const organizationId = body.data.organizationId;
  if (organizationId && !isOrganizationMember(db, organizationId, user.id)) {
    return Response.json(
      {
        error: "forbidden",
        message: "소속된 조직에만 문서를 공유할 수 있어요.",
      },
      { status: 403 },
    );
  }

  db.prepare(
    `UPDATE judgments
      SET visibility = ?, organization_id = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    organizationId ? "organization" : "private",
    organizationId,
    nowIso(),
    id,
  );
  auditLog(db, {
    action: organizationId ? "judgment.shared" : "judgment.unshared",
    targetType: "judgment",
    targetId: id,
    metadata: { organizationId },
  });

  return Response.json({ ok: true });
}
