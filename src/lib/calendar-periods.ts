export function periodBounds(input: {
  date?: Date;
  half?: number;
  month?: number;
  operation: string;
  quarter?: number;
  year?: number;
}) {
  if (input.operation === "list_period") {
    return null;
  }
  const year = input.year ?? input.date?.getUTCFullYear();
  if (!year) {
    throw new Error("year 또는 date가 필요합니다.");
  }
  if (input.operation === "list_month") {
    const month =
      input.month ?? (input.date ? input.date.getUTCMonth() + 1 : undefined);
    if (!month || month < 1 || month > 12) {
      throw new Error("month는 1부터 12 사이여야 합니다.");
    }
    return monthBounds(year, month);
  }
  if (input.operation === "list_quarter") {
    const quarter =
      input.quarter ?? Math.floor((input.date?.getUTCMonth() ?? 0) / 3) + 1;
    if (quarter < 1 || quarter > 4) {
      throw new Error("quarter는 1부터 4 사이여야 합니다.");
    }
    return monthRangeBounds(year, (quarter - 1) * 3 + 1, quarter * 3);
  }
  if (input.operation === "list_half") {
    const half =
      input.half ?? (input.date && input.date.getUTCMonth() < 6 ? 1 : 2);
    if (half !== 1 && half !== 2) {
      throw new Error("half는 1 또는 2여야 합니다.");
    }
    return half === 1
      ? monthRangeBounds(year, 1, 6)
      : monthRangeBounds(year, 7, 12);
  }
  if (input.operation === "list_year") {
    return monthRangeBounds(year, 1, 12);
  }
  return null;
}

function monthBounds(year: number, month: number) {
  return monthRangeBounds(year, month, month);
}

function monthRangeBounds(year: number, startMonth: number, endMonth: number) {
  return {
    endDate: new Date(Date.UTC(year, endMonth, 0)),
    startDate: new Date(Date.UTC(year, startMonth - 1, 1)),
  };
}
