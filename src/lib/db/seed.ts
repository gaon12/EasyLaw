import { randomUUID } from "node:crypto";
import { nowIso } from "../time";
import type { SqliteDatabase } from ".";

export function seedDatabase(db: SqliteDatabase) {
  const seeded = db
    .prepare<[], { count: number }>("SELECT COUNT(*) as count FROM users")
    .get();

  if (seeded && seeded.count > 0) {
    return;
  }

  const now = nowIso();
  const adminId = "user_admin";
  const ownerId = "user_owner";
  const orgId = "org_legal_aid";
  const promptId = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users
        (id, email, display_name, role, totp_enabled, totp_required, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      adminId,
      "admin@easylaw.local",
      "서비스 운영 총 관리자",
      "admin",
      0,
      1,
      now,
      now,
    );

    db.prepare(
      `INSERT INTO users
        (id, email, display_name, role, totp_enabled, totp_required, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ownerId,
      "owner@easylaw.local",
      "법률구조 조직 소유자",
      "user",
      0,
      1,
      now,
      now,
    );

    db.prepare(
      `INSERT INTO organizations
        (id, name, slug, owner_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(orgId, "이지리드 법률구조팀", "legal-aid", ownerId, now, now);

    db.prepare(
      `INSERT INTO organization_members
        (id, organization_id, user_id, role, created_at)
        VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), orgId, ownerId, "owner", now);

    db.prepare(
      `INSERT INTO prompt_versions
        (id, version, description, is_active, created_at)
        VALUES (?, ?, ?, ?, ?)`,
    ).run(
      promptId,
      "easyread-beta-001",
      "Beta scaffold prompt version for Easy-Read judgment generation",
      1,
      now,
    );
  });

  tx();
}
