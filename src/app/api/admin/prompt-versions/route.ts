import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { getDatabase } from "@/lib/db";
import { newId } from "@/lib/security/crypto";
import { nowIso } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const promptVersionRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("activate"),
    version: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("create"),
    version: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9._-]*$/i, "버전 이름 형식이 올바르지 않습니다."),
    description: z.string().trim().min(1).max(300),
  }),
]);

export async function POST(request: Request) {
  const body = promptVersionRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDatabase();
  if (body.data.action === "create") {
    const exists = db
      .prepare<[string], { id: string }>(
        "SELECT id FROM prompt_versions WHERE version = ?",
      )
      .get(body.data.version);
    if (exists) {
      return Response.json(
        { error: "duplicate_version", message: "이미 있는 버전 이름입니다." },
        { status: 409 },
      );
    }
    db.prepare(
      `INSERT INTO prompt_versions (id, version, description, is_active, created_at)
        VALUES (?, ?, ?, 0, ?)`,
    ).run(newId("prompt"), body.data.version, body.data.description, nowIso());
    auditLog(db, {
      action: "prompt_version.created",
      targetType: "prompt_version",
      targetId: body.data.version,
      metadata: {},
    });
    return Response.json({ ok: true });
  }

  const target = db
    .prepare<[string], { id: string }>(
      "SELECT id FROM prompt_versions WHERE version = ?",
    )
    .get(body.data.version);
  if (!target) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const version = body.data.version;
  const activate = db.transaction(() => {
    db.prepare("UPDATE prompt_versions SET is_active = 0").run();
    db.prepare(
      "UPDATE prompt_versions SET is_active = 1 WHERE version = ?",
    ).run(version);
  });
  activate();
  auditLog(db, {
    action: "prompt_version.activated",
    targetType: "prompt_version",
    targetId: body.data.version,
    metadata: {},
  });
  return Response.json({ ok: true });
}
