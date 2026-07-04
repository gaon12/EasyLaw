type HolidayRule = "api" | "fixed" | "lunar" | "substitute";

export type KoreanHoliday = {
  date: string;
  name: string;
  rule: HolidayRule;
};

export type KoreanCalendarDay = {
  date: string;
  holidayNames: string[];
  isHoliday: boolean;
  isWeekend: boolean;
  weekday: string;
};

type HolidaySeed = KoreanHoliday & {
  substituteGroup: "none" | "regular" | "seollal-chuseok";
};

export function koreanHolidaysForYear(year: number): KoreanHoliday[] {
  const seeds = holidaySeedsForYear(year);
  const holidayMap = new Map<string, HolidaySeed[]>();
  for (const holiday of seeds) {
    const current = holidayMap.get(holiday.date) ?? [];
    current.push(holiday);
    holidayMap.set(holiday.date, current);
  }

  const substitutes: KoreanHoliday[] = [];
  for (const holiday of seeds) {
    if (!needsSubstitute(holiday, holidayMap)) {
      continue;
    }
    const date = firstNonHolidayAfter(holiday.date, holidayMap, substitutes);
    const substitute = {
      date,
      name: `${holiday.name} 대체공휴일`,
      rule: "substitute" as const,
    };
    substitutes.push(substitute);
    holidayMap.set(date, [
      ...(holidayMap.get(date) ?? []),
      { ...substitute, substituteGroup: "none" },
    ]);
  }

  return [...seeds, ...substitutes]
    .map(({ date, name, rule }) => ({ date, name, rule }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function koreanCalendarDay(date: Date): KoreanCalendarDay {
  return koreanCalendarDayFromHolidays(
    date,
    koreanHolidaysNearYear(date.getUTCFullYear()),
  );
}

export function koreanCalendarDayFromHolidays(
  date: Date,
  holidays: KoreanHoliday[],
): KoreanCalendarDay {
  const iso = formatIsoDate(date);
  const matchedHolidays = holidays.filter((holiday) => holiday.date === iso);
  return {
    date: iso,
    holidayNames: matchedHolidays.map((holiday) => holiday.name),
    isHoliday: matchedHolidays.length > 0,
    isWeekend: isWeekend(date),
    weekday: weekdayLabel(date),
  };
}

export function koreanCalendarDays(startDate: Date, endDate: Date) {
  return koreanCalendarDaysFromHolidays(
    startDate,
    endDate,
    koreanHolidaysNearYear(startDate.getUTCFullYear()),
  );
}

export function koreanCalendarDaysFromHolidays(
  startDate: Date,
  endDate: Date,
  holidays: KoreanHoliday[],
) {
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error("시작일은 종료일보다 늦을 수 없습니다.");
  }
  if (differenceInDays(startDate, endDate) > 370) {
    throw new Error("기간 목록은 최대 370일까지 지원합니다.");
  }

  const holidayByDate = new Map<string, KoreanHoliday[]>();
  for (const holiday of holidays) {
    holidayByDate.set(holiday.date, [
      ...(holidayByDate.get(holiday.date) ?? []),
      holiday,
    ]);
  }

  const days: KoreanCalendarDay[] = [];
  for (
    let cursor = startDate;
    cursor.getTime() <= endDate.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const iso = formatIsoDate(cursor);
    const dayHolidays = holidayByDate.get(iso) ?? [];
    days.push({
      date: iso,
      holidayNames: dayHolidays.map((holiday) => holiday.name),
      isHoliday: dayHolidays.length > 0,
      isWeekend: isWeekend(cursor),
      weekday: weekdayLabel(cursor),
    });
  }
  return days;
}

function holidaySeedsForYear(year: number): HolidaySeed[] {
  return [
    seed(`${year}-01-01`, "신정", "fixed", "none"),
    seed(`${year}-03-01`, "삼일절", "fixed", "regular"),
    seed(`${year}-05-05`, "어린이날", "fixed", "regular"),
    seed(`${year}-06-06`, "현충일", "fixed", "none"),
    seed(`${year}-08-15`, "광복절", "fixed", "regular"),
    seed(`${year}-10-03`, "개천절", "fixed", "regular"),
    seed(`${year}-10-09`, "한글날", "fixed", "regular"),
    seed(`${year}-12-25`, "성탄절", "fixed", "regular"),
    ...lunarHolidaySeeds(year),
  ];
}

function lunarHolidaySeeds(year: number): HolidaySeed[] {
  const seollal = findLunarDate(year, 1, 1);
  const chuseok = findLunarDate(year, 8, 15);
  const buddha = findLunarDate(year, 4, 8);
  return [
    seed(
      formatIsoDate(addDays(seollal, -1)),
      "설날 전날",
      "lunar",
      "seollal-chuseok",
    ),
    seed(formatIsoDate(seollal), "설날", "lunar", "seollal-chuseok"),
    seed(
      formatIsoDate(addDays(seollal, 1)),
      "설날 다음날",
      "lunar",
      "seollal-chuseok",
    ),
    seed(formatIsoDate(buddha), "부처님오신날", "lunar", "regular"),
    seed(
      formatIsoDate(addDays(chuseok, -1)),
      "추석 전날",
      "lunar",
      "seollal-chuseok",
    ),
    seed(formatIsoDate(chuseok), "추석", "lunar", "seollal-chuseok"),
    seed(
      formatIsoDate(addDays(chuseok, 1)),
      "추석 다음날",
      "lunar",
      "seollal-chuseok",
    ),
  ];
}

function seed(
  date: string,
  name: string,
  rule: HolidayRule,
  substituteGroup: HolidaySeed["substituteGroup"],
): HolidaySeed {
  return { date, name, rule, substituteGroup };
}

function needsSubstitute(
  holiday: HolidaySeed,
  holidayMap: Map<string, HolidaySeed[]>,
) {
  if (holiday.substituteGroup === "none") {
    return false;
  }
  const date = parseIsoDate(holiday.date);
  const sameDayHolidays = holidayMap.get(holiday.date) ?? [];
  const overlapsAnotherHoliday = sameDayHolidays.length > 1;
  if (holiday.substituteGroup === "regular") {
    return isWeekend(date) || overlapsAnotherHoliday;
  }
  return date.getUTCDay() === 0 || overlapsAnotherHoliday;
}

function firstNonHolidayAfter(
  isoDate: string,
  holidayMap: Map<string, HolidaySeed[]>,
  substitutes: KoreanHoliday[],
) {
  let cursor = addDays(parseIsoDate(isoDate), 1);
  for (;;) {
    const iso = formatIsoDate(cursor);
    const hasBaseHoliday = holidayMap.has(iso);
    const hasSubstitute = substitutes.some((holiday) => holiday.date === iso);
    if (!hasBaseHoliday && !hasSubstitute && !isWeekend(cursor)) {
      return iso;
    }
    cursor = addDays(cursor, 1);
  }
}

function koreanHolidaysNearYear(year: number) {
  return [year - 1, year, year + 1].flatMap(koreanHolidaysForYear);
}

function findLunarDate(year: number, month: number, day: number) {
  const start =
    month <= 4
      ? new Date(Date.UTC(year, 0, 1))
      : new Date(Date.UTC(year, 7, 1));
  const end =
    month <= 4
      ? new Date(Date.UTC(year, 5, 30))
      : new Date(Date.UTC(year, 10, 30));
  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const lunar = lunarMonthDay(cursor);
    if (lunar.month === month && lunar.day === day) {
      return cursor;
    }
  }
  throw new Error(
    `음력 ${year}-${month}-${day}에 해당하는 날짜를 찾지 못했습니다.`,
  );
}

function lunarMonthDay(date: Date) {
  const parts = new Intl.DateTimeFormat("ko-KR-u-ca-dangi", {
    day: "numeric",
    month: "numeric",
  }).formatToParts(date);
  return {
    day: Number(parts.find((part) => part.type === "day")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
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

function differenceInDays(startDate: Date, endDate: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime()) / dayMs);
}

function isWeekend(date: Date) {
  return date.getUTCDay() === 0 || date.getUTCDay() === 6;
}

function weekdayLabel(date: Date) {
  return ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string) {
  const [year, month, day] = value
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}
