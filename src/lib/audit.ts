import type { SqliteDatabase } from "./db";
import { newId } from "./security/crypto";
import { nowIso } from "./time";

export function auditLog(
  db: SqliteDatabase,
  input: {
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  db.prepare(
    `INSERT INTO audit_logs
      (id, actor_user_id, action, target_type, target_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("audit"),
    input.actorUserId ?? null,
    input.action,
    input.targetType,
    input.targetId ?? null,
    JSON.stringify(input.metadata ?? {}),
    nowIso(),
  );
}
