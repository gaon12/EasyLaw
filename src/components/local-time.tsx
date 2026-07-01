"use client";

import { useEffect, useState } from "react";

type LocalTimeProps = {
  dateTime: string;
  dateOnly?: boolean;
};

export function LocalTime({ dateTime, dateOnly = false }: LocalTimeProps) {
  const [label, setLabel] = useState(formatUtc(dateTime, dateOnly));

  useEffect(() => {
    if (dateOnly) {
      setLabel(formatUtc(dateTime, true));
      return;
    }

    const date = new Date(normalizeDateTime(dateTime));
    if (Number.isNaN(date.getTime())) {
      return;
    }

    setLabel(
      new Intl.DateTimeFormat(navigator.language || "ko-KR", {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date),
    );
  }, [dateOnly, dateTime]);

  return (
    <time dateTime={normalizeDateTime(dateTime)} suppressHydrationWarning>
      {label}
    </time>
  );
}

function formatUtc(value: string, dateOnly: boolean) {
  const date = new Date(normalizeDateTime(value));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    hour: dateOnly ? undefined : "2-digit",
    minute: dateOnly ? undefined : "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function normalizeDateTime(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  return `${value}Z`;
}
