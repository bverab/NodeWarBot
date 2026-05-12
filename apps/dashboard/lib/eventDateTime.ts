export type EventDateTimeInput = {
  date: string;
  time: string;
  timezone: string;
};

export type EventLifecycleDates = {
  startsAt: Date;
  expiresAt: Date;
  closesAt: Date;
};

export const DEFAULT_EVENT_TIMEZONE = "America/Santiago";

const TIMEZONE_ALIASES: Record<string, string> = {
  "america/chile": "America/Santiago",
  "america/santiago": "America/Santiago"
};

export type NormalizedTimezoneInfo = {
  timezone: string;
  source: "alias" | "exact" | "fallback";
};

export function isValidTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezoneInfo(input: string | null | undefined): NormalizedTimezoneInfo {
  const raw = String(input || "").trim();
  if (!raw) {
    return { timezone: DEFAULT_EVENT_TIMEZONE, source: "fallback" };
  }

  const alias = TIMEZONE_ALIASES[raw.toLowerCase()];
  if (alias) {
    return { timezone: alias, source: alias === raw ? "exact" : "alias" };
  }

  if (isValidTimeZone(raw)) {
    return { timezone: raw, source: "exact" };
  }

  return { timezone: DEFAULT_EVENT_TIMEZONE, source: "fallback" };
}

export function normalizeTimezone(input: string | null | undefined) {
  return normalizeTimezoneInfo(input).timezone;
}

function parseDateParts(dateValue: string) {
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }

  return { year, month, day };
}

export function normalizeEventTimeInput(timeValue: string) {
  const match = String(timeValue || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function getZonedDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second")
  };
}

function partsToUtcMs(parts: ReturnType<typeof getZonedDateParts>) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function sameLocalMinute(
  left: ReturnType<typeof getZonedDateParts>,
  right: ReturnType<typeof getZonedDateParts>
) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

export function buildEventDateTime({ date, time, timezone }: EventDateTimeInput) {
  const dateParts = parseDateParts(date);
  const normalizedTime = normalizeEventTimeInput(time);
  if (!dateParts || !normalizedTime) {
    return null;
  }

  const timezoneInfo = normalizeTimezoneInfo(timezone);
  if (timezoneInfo.source === "fallback" && String(timezone || "").trim()) {
    return null;
  }
  const safeTimezone = timezoneInfo.timezone;

  const [hour, minute] = normalizedTime.split(":").map(Number);
  const target = { ...dateParts, hour, minute, second: 0 };
  let candidateMs = partsToUtcMs(target);

  for (let index = 0; index < 4; index += 1) {
    const actual = getZonedDateParts(new Date(candidateMs), safeTimezone);
    if (sameLocalMinute(actual, target)) {
      return new Date(candidateMs);
    }

    candidateMs += partsToUtcMs(target) - partsToUtcMs(actual);
  }

  const finalParts = getZonedDateParts(new Date(candidateMs), safeTimezone);
  return sameLocalMinute(finalParts, target) ? new Date(candidateMs) : null;
}

export function calculateEventLifecycleDates(input: EventDateTimeInput & { duration: number; closeBeforeMinutes: number }): EventLifecycleDates | null {
  const startsAt = buildEventDateTime(input);
  if (!startsAt || !Number.isFinite(input.duration) || !Number.isFinite(input.closeBeforeMinutes)) {
    return null;
  }

  const expiresAt = new Date(startsAt.getTime() + input.duration * 60_000);
  const closesAt = new Date(expiresAt.getTime() - input.closeBeforeMinutes * 60_000);

  return { startsAt, expiresAt, closesAt };
}

export function calculateScheduledPublishAt({
  startsAt,
  publishBeforeMinutes
}: {
  startsAt: Date | string | number | null | undefined;
  publishBeforeMinutes: number;
}) {
  const date = startsAt instanceof Date ? startsAt : new Date(startsAt ?? NaN);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(publishBeforeMinutes) || publishBeforeMinutes < 0) {
    return null;
  }

  return new Date(date.getTime() - Math.trunc(publishBeforeMinutes) * 60_000);
}

export function formatDateTimeInTimezone(value: Date | string | null | undefined, timezone?: string | null) {
  if (!value) {
    return "Not set";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: normalizeTimezone(timezone),
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
