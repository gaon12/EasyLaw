import { createHash } from "node:crypto";
import type { SqliteDatabase } from "./db";
import { logIntegrationEvent } from "./integration-events";
import {
  type KoreanHoliday,
  koreanCalendarDayFromHolidays,
  koreanCalendarDaysFromHolidays,
  koreanHolidaysForYear,
} from "./korean-holidays";
import { newId } from "./security/crypto";
import { getSetting } from "./settings";
import { nowIso } from "./time";

const API_URL =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo";
const provider = "data-go-kr-holidays";
const cacheTtlMs = 7 * 24 * 60 * 60 * 1000;

export async function koreanHolidaysForYearCached(
  db: SqliteDatabase,
  year: number,
): Promise<KoreanHoliday[]> {
  const cached = readCachedHolidays(db, year);
  if (cached) {
    return cached;
  }

  const apiKey = getSetting(db, "data_go_kr_api_key");
  if (!apiKey) {
    return koreanHolidaysForYear(year);
  }

  try {
    const holidays = await fetchHolidaysFromDataGoKr(apiKey, year);
    cacheHolidays(db, year, holidays);
    return holidays;
  } catch (error) {
    logIntegrationEvent(db, {
      action: "holidays.fetch",
      message:
        error instanceof Error
          ? error.message
          : "공공데이터 공휴일 API 호출에 실패했습니다.",
      metadata: { year },
      service: provider,
      status: "failed",
    });
    return koreanHolidaysForYear(year);
  }
}

export async function koreanCalendarDayCached(db: SqliteDatabase, date: Date) {
  const holidays = await koreanHolidaysNearYearCached(
    db,
    date.getUTCFullYear(),
  );
  return koreanCalendarDayFromHolidays(date, holidays);
}

export async function koreanCalendarDaysCached(
  db: SqliteDatabase,
  startDate: Date,
  endDate: Date,
) {
  const holidays = await koreanHolidaysNearYearCached(
    db,
    startDate.getUTCFullYear(),
  );
  return koreanCalendarDaysFromHolidays(startDate, endDate, holidays);
}

async function koreanHolidaysNearYearCached(db: SqliteDatabase, year: number) {
  const years = [year - 1, year, year + 1];
  const batches = await Promise.all(
    years.map((targetYear) => koreanHolidaysForYearCached(db, targetYear)),
  );
  return batches.flat();
}

function readCachedHolidays(db: SqliteDatabase, year: number) {
  const row = db
    .prepare<[string, string, string], { response_json: string }>(
      `SELECT response_json
        FROM external_api_cache
        WHERE provider = ? AND cache_key = ? AND expires_at > ?
        LIMIT 1`,
    )
    .get(provider, cacheKey(year), nowIso());
  if (!row) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.response_json) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isKoreanHoliday)
      : koreanHolidaysForYear(year);
  } catch {
    return null;
  }
}

function cacheHolidays(
  db: SqliteDatabase,
  year: number,
  holidays: KoreanHoliday[],
) {
  const responseJson = JSON.stringify(holidays);
  db.prepare(
    `INSERT INTO external_api_cache
      (id, provider, cache_key, response_json, raw_hash, fetched_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, cache_key)
      DO UPDATE SET
        response_json = excluded.response_json,
        raw_hash = excluded.raw_hash,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at`,
  ).run(
    newId("cache"),
    provider,
    cacheKey(year),
    responseJson,
    createHash("sha256").update(responseJson).digest("hex"),
    nowIso(),
    new Date(Date.now() + cacheTtlMs).toISOString(),
  );
}

async function fetchHolidaysFromDataGoKr(apiKey: string, year: number) {
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      fetchHolidayMonth(apiKey, year, index + 1),
    ),
  );
  const holidays = results.flat();
  return holidays.length > 0 ? holidays : koreanHolidaysForYear(year);
}

async function fetchHolidayMonth(apiKey: string, year: number, month: number) {
  const serviceKey = apiKey.includes("%") ? apiKey : encodeURIComponent(apiKey);
  const url = new URL(`${API_URL}?ServiceKey=${serviceKey}`);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("solYear", String(year));
  url.searchParams.set("solMonth", String(month).padStart(2, "0"));

  const response = await fetch(url, {
    headers: { Accept: "application/xml,text/xml,*/*" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `공공데이터 공휴일 API가 ${response.status} 상태를 반환했습니다.`,
    );
  }
  return parseHolidayXml(await response.text());
}

function parseHolidayXml(xml: string): KoreanHoliday[] {
  const holidays: KoreanHoliday[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = match[1];
    const isHoliday = xmlValue(item, "isHoliday");
    const locdate = xmlValue(item, "locdate");
    const name = xmlValue(item, "dateName");
    if (isHoliday !== "Y" || !locdate || !name) {
      continue;
    }
    holidays.push({
      date: `${locdate.slice(0, 4)}-${locdate.slice(4, 6)}-${locdate.slice(6, 8)}`,
      name,
      rule: "api",
    });
  }
  return holidays;
}

function xmlValue(item: string | undefined, tag: string) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(item ?? "");
  return match ? decodeXml(match[1]).trim() : null;
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function cacheKey(year: number) {
  return `holidays:${year}:v1`;
}

function isKoreanHoliday(value: unknown): value is KoreanHoliday {
  return (
    typeof value === "object" &&
    value !== null &&
    "date" in value &&
    "name" in value &&
    typeof value.date === "string" &&
    typeof value.name === "string"
  );
}
