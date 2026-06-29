import type { SqliteDatabase } from "../db";
import { nowIso } from "../time";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

export function checkRateLimit(
  db: SqliteDatabase,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = new Date();
  const nowText = now.toISOString();
  const existing = db
    .prepare<
      [string],
      { key: string; count: number; window_start: string; updated_at: string }
    >(
      "SELECT key, count, window_start, updated_at FROM rate_limits WHERE key = ?",
    )
    .get(key);

  if (!existing) {
    db.prepare(
      `INSERT INTO rate_limits (key, count, window_start, updated_at)
        VALUES (?, ?, ?, ?)`,
    ).run(key, 1, nowText, nowText);
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: new Date(now.getTime() + windowMs).toISOString(),
    };
  }

  const windowStart = new Date(existing.window_start);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  if (now >= resetAt) {
    db.prepare(
      `UPDATE rate_limits
        SET count = ?, window_start = ?, updated_at = ?
        WHERE key = ?`,
    ).run(1, nowText, nowText, key);
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: new Date(now.getTime() + windowMs).toISOString(),
    };
  }

  const nextCount = existing.count + 1;
  db.prepare(
    "UPDATE rate_limits SET count = ?, updated_at = ? WHERE key = ?",
  ).run(nextCount, nowIso(), key);

  return {
    allowed: nextCount <= limit,
    remaining: Math.max(0, limit - nextCount),
    resetAt: resetAt.toISOString(),
  };
}
