import { periodBounds } from "./calendar-periods";
import type { SqliteDatabase } from "./db";
import {
  koreanCalendarDayCached,
  koreanCalendarDaysCached,
} from "./korean-holiday-cache";
import type { McpToolCallResult } from "./mcp-client";

export const dateCalculatorInputSchema = {
  properties: {
    amount: {
      description:
        "더하거나 뺄 수. today, diff_days, weekday에는 필요 없습니다.",
      type: "integer",
    },
    date: {
      description: "기준 날짜(YYYY-MM-DD). today 외에는 필요합니다.",
      type: "string",
    },
    endDate: {
      description: "diff_days 또는 list_period의 종료 날짜(YYYY-MM-DD).",
      type: "string",
    },
    half: {
      description: "list_half의 반기(1 또는 2).",
      type: "integer",
    },
    month: {
      description: "list_month의 월(1-12).",
      type: "integer",
    },
    quarter: {
      description: "list_quarter의 분기(1-4).",
      type: "integer",
    },
    operation: {
      enum: [
        "today",
        "add_days",
        "add_months",
        "add_years",
        "diff_days",
        "weekday",
        "is_holiday",
        "list_period",
        "list_month",
        "list_quarter",
        "list_half",
        "list_year",
      ],
      type: "string",
    },
    year: {
      description: "list_month/list_quarter/list_half/list_year의 연도.",
      type: "integer",
    },
  },
  required: ["operation"],
  type: "object",
} as const;

export function calculateDate(
  db: SqliteDatabase,
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const operation = typeof args.operation === "string" ? args.operation : "";
  return calculateDateInner(db, operation, args);
}

async function calculateDateInner(
  db: SqliteDatabase,
  operation: string,
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  try {
    if (operation === "today") {
      const resultDate = todayInKorea();
      return toolJsonResult({
        operation,
        resultDate,
        weekday: weekdayLabel(parseIsoDate(resultDate)),
      });
    }

    const date =
      typeof args.date === "string" ? readIsoDate(args.date, "date") : null;
    const period = periodForOperation(operation, args, date);
    if (period) {
      const days = await koreanCalendarDaysCached(
        db,
        period.startDate,
        period.endDate,
      );
      return toolJsonResult({
        endDate: formatIsoDate(period.endDate),
        holidays: days
          .filter((day) => day.isHoliday)
          .map(({ date, holidayNames, weekday }) => ({
            date,
            names: holidayNames,
            weekday,
          })),
        nonWorkingDays: days.filter((day) => day.isHoliday || day.isWeekend),
        operation,
        startDate: formatIsoDate(period.startDate),
        weekends: days.filter((day) => day.isWeekend),
      });
    }

    if (!date) {
      return toolError("date가 필요합니다.");
    }
    if (operation === "weekday") {
      return toolJsonResult({
        date: formatIsoDate(date),
        isWeekend: isWeekend(date),
        operation,
        weekday: weekdayLabel(date),
      });
    }

    if (operation === "is_holiday") {
      const calendarDay = await koreanCalendarDayCached(db, date);
      return toolJsonResult({
        ...calendarDay,
        operation,
      });
    }

    if (operation === "diff_days") {
      const endDate = readIsoDate(args.endDate, "endDate");
      return toolJsonResult({
        days: differenceInDays(date, endDate),
        endDate: formatIsoDate(endDate),
        operation,
        startDate: formatIsoDate(date),
      });
    }

    const amount = readIntegerAmount(args.amount);
    const resultDate =
      operation === "add_days"
        ? addDays(date, amount)
        : operation === "add_months"
          ? addMonths(date, amount)
          : operation === "add_years"
            ? addMonths(date, amount * 12)
            : null;
    if (!resultDate) {
      return toolError("지원하지 않는 날짜 operation입니다.");
    }
    return toolJsonResult({
      amount,
      date: formatIsoDate(date),
      operation,
      resultDate: formatIsoDate(resultDate),
      weekday: weekdayLabel(resultDate),
    });
  } catch (error) {
    return toolError(
      error instanceof Error ? error.message : "날짜 계산에 실패했습니다.",
    );
  }
}

function periodForOperation(
  operation: string,
  args: Record<string, unknown>,
  date: Date | null,
) {
  if (operation === "list_period") {
    if (!date) {
      throw new Error("list_period에는 date가 필요합니다.");
    }
    return {
      endDate: readIsoDate(args.endDate, "endDate"),
      startDate: date,
    };
  }
  return periodBounds({
    date: date ?? undefined,
    half: optionalInteger(args.half),
    month: optionalInteger(args.month),
    operation,
    quarter: optionalInteger(args.quarter),
    year: optionalInteger(args.year),
  });
}

function toolJsonResult(
  structuredContent: Record<string, unknown>,
): McpToolCallResult {
  return {
    content: [{ text: JSON.stringify(structuredContent), type: "text" }],
    isError: false,
    structuredContent,
  };
}

function toolError(message: string): McpToolCallResult {
  return {
    content: [{ text: message, type: "text" }],
    isError: true,
  };
}

function readIsoDate(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`${field}가 필요합니다.`);
  }
  return parseIsoDate(value);
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error("날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`존재하지 않는 날짜입니다: ${value}`);
  }
  return date;
}

function readIntegerAmount(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("amount는 정수여야 합니다.");
  }
  if (Math.abs(value) > 10_000) {
    throw new Error("amount는 -10000 이상 10000 이하만 지원합니다.");
  }
  return value;
}

function optionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

function addDays(date: Date, days: number) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function addMonths(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function differenceInDays(startDate: Date, endDate: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime()) / dayMs);
}

function isWeekend(date: Date) {
  return date.getUTCDay() === 0 || date.getUTCDay() === 6;
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekdayLabel(date: Date) {
  return ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
}

function todayInKorea() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  });
  return formatter.format(new Date());
}
