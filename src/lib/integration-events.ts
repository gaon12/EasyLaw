import type { SqliteDatabase } from "./db";
import { newId } from "./security/crypto";
import { nowIso } from "./time";

export type IntegrationEventStatus = "success" | "failed" | "skipped";

export type IntegrationEventRow = {
  action: string;
  createdAt: string;
  message: string | null;
  metadata: Record<string, unknown>;
  service: string;
  status: IntegrationEventStatus;
};

export function logIntegrationEvent(
  db: SqliteDatabase,
  input: {
    action: string;
    message?: string | null;
    metadata?: Record<string, unknown>;
    service: string;
    status: IntegrationEventStatus;
  },
) {
  db.prepare(
    `INSERT INTO integration_events
      (id, service, action, status, message, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("intevent"),
    input.service,
    input.action,
    input.status,
    input.message ?? null,
    JSON.stringify(input.metadata ?? {}),
    nowIso(),
  );
}

export function listIntegrationEvents(
  db: SqliteDatabase,
  service: string,
  limit = 12,
): IntegrationEventRow[] {
  return db
    .prepare<
      [string, number],
      {
        action: string;
        created_at: string;
        message: string | null;
        metadata_json: string;
        service: string;
        status: IntegrationEventStatus;
      }
    >(
      `SELECT service, action, status, message, metadata_json, created_at
        FROM integration_events
        WHERE service = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all(service, limit)
    .map((row) => ({
      action: row.action,
      createdAt: row.created_at,
      message: row.message,
      metadata: parseMetadata(row.metadata_json),
      service: row.service,
      status: row.status,
    }));
}

function parseMetadata(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (_error) {
    return {};
  }
}
