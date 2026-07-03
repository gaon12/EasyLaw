import { cookies } from "next/headers";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { ensureUser } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { newId } from "@/lib/security/crypto";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { nowIso } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orgRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(2).max(80),
  }),
  z.object({
    action: z.literal("invite"),
    organizationId: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
  }),
  z.object({
    action: z.literal("remove"),
    organizationId: z.string().trim().min(1).max(80),
    memberUserId: z.string().trim().min(1).max(80),
  }),
]);

export async function POST(request: Request) {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = orgRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  if (body.data.action === "create") {
    const name = body.data.name;
    const limit = checkRateLimit(
      db,
      `org-create:${user.id}`,
      5,
      24 * 60 * 60 * 1000,
    );
    if (!limit.allowed) {
      return Response.json(
        {
          error: "rate_limited",
          message: "조직은 하루에 5개까지만 만들 수 있어요.",
        },
        { status: 429 },
      );
    }
    const id = newId("org");
    const now = nowIso();
    const slug = uniqueSlug(db, name);
    const create = db.transaction(() => {
      db.prepare(
        `INSERT INTO organizations (id, name, slug, owner_user_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, name, slug, user.id, now, now);
      db.prepare(
        `INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
          VALUES (?, ?, ?, 'owner', ?)`,
      ).run(newId("member"), id, user.id, now);
    });
    create();
    auditLog(db, {
      action: "organization.created",
      targetType: "organization",
      targetId: id,
      metadata: { name },
    });
    return Response.json({ id, ok: true, slug });
  }

  // invite/remove는 조직 소유자만 가능하다.
  const organization = db
    .prepare<[string, string], { id: string; owner_user_id: string }>(
      `SELECT id, owner_user_id FROM organizations
        WHERE id = ? AND owner_user_id = ?`,
    )
    .get(body.data.organizationId, user.id);
  if (!organization) {
    return Response.json(
      {
        error: "forbidden",
        message: "조직 소유자만 구성원을 관리할 수 있어요.",
      },
      { status: 403 },
    );
  }

  if (body.data.action === "invite") {
    const limit = checkRateLimit(
      db,
      `org-invite:${user.id}`,
      30,
      24 * 60 * 60 * 1000,
    );
    if (!limit.allowed) {
      return Response.json(
        {
          error: "rate_limited",
          message: "초대가 너무 잦아요. 잠시 후 다시 시도해 주세요.",
        },
        { status: 429 },
      );
    }
    const invited = ensureUser(db, body.data.email);
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO organization_members
          (id, organization_id, user_id, role, created_at)
          VALUES (?, ?, ?, 'member', ?)`,
      )
      .run(newId("member"), organization.id, invited.id, nowIso());
    if (inserted.changes === 0) {
      return Response.json(
        {
          error: "already_member",
          message: "이미 이 조직의 구성원이에요.",
        },
        { status: 409 },
      );
    }
    auditLog(db, {
      action: "organization.member_invited",
      targetType: "organization",
      targetId: organization.id,
      metadata: { email: body.data.email },
    });
    return Response.json({ ok: true });
  }

  if (body.data.memberUserId === organization.owner_user_id) {
    return Response.json(
      { error: "invalid_request", message: "소유자는 내보낼 수 없어요." },
      { status: 400 },
    );
  }
  const removed = db
    .prepare(
      `DELETE FROM organization_members
        WHERE organization_id = ? AND user_id = ?`,
    )
    .run(organization.id, body.data.memberUserId);
  if (removed.changes === 0) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  auditLog(db, {
    action: "organization.member_removed",
    targetType: "organization",
    targetId: organization.id,
    metadata: { memberUserId: body.data.memberUserId },
  });
  return Response.json({ ok: true });
}

function uniqueSlug(db: ReturnType<typeof getDatabase>, name: string): string {
  const base =
    name
      .toLowerCase()
      .replaceAll(/[^a-z0-9가-힣]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, 40) || "org";
  let candidate = base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const exists = db
      .prepare<[string], { id: string }>(
        "SELECT id FROM organizations WHERE slug = ?",
      )
      .get(candidate);
    if (!exists) {
      return candidate;
    }
    candidate = `${base}-${suffix}`;
  }
  return `${base}-${newId("s").slice(-6)}`;
}
