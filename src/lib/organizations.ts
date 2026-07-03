import type { SqliteDatabase } from "./db";

export type UserOrganization = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "member";
};

/** 사용자가 소유하거나 속한 조직 목록. */
export function getUserOrganizations(
  db: SqliteDatabase,
  userId: string,
): UserOrganization[] {
  return db
    .prepare<
      [string, string, string],
      { id: string; name: string; slug: string; role: string }
    >(
      `SELECT organizations.id, organizations.name, organizations.slug,
        CASE WHEN organizations.owner_user_id = ? THEN 'owner'
          ELSE COALESCE(organization_members.role, 'member') END AS role
      FROM organizations
      LEFT JOIN organization_members
        ON organization_members.organization_id = organizations.id
        AND organization_members.user_id = ?
      WHERE organizations.owner_user_id = ?
        OR organization_members.id IS NOT NULL
      ORDER BY organizations.created_at ASC`,
    )
    .all(userId, userId, userId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role === "owner" ? "owner" : "member",
      slug: row.slug,
    }));
}

export function isOrganizationMember(
  db: SqliteDatabase,
  organizationId: string,
  userId: string,
) {
  return Boolean(
    db
      .prepare<[string, string, string], { present: number }>(
        `SELECT 1 AS present
          FROM organizations
          LEFT JOIN organization_members
            ON organization_members.organization_id = organizations.id
            AND organization_members.user_id = ?
          WHERE organizations.id = ?
            AND (organizations.owner_user_id = ?
              OR organization_members.id IS NOT NULL)
          LIMIT 1`,
      )
      .get(userId, organizationId, userId),
  );
}
