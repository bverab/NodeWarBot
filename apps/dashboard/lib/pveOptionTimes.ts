const MINUTES_PER_DAY = 24 * 60;

function toMinutes(value: string) {
  const match = String(value || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  return hour <= 23 ? hour * 60 + Number(match[2]) : null;
}

function toTime(minutes: number) {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

// Time proposed for a new PvE option: an hour after the last usable option, skipping times that are already taken
// (the server rejects two options at the same time). Falls back to `fallback` (or 20:00) when there is nothing to build on.
export function suggestNextOptionTime(existingTimes: string[], fallback = "20:00") {
  const taken = new Set(existingTimes.map(toMinutes).filter((minutes): minutes is number => minutes !== null));
  const last = [...existingTimes].reverse().map(toMinutes).find((minutes): minutes is number => minutes !== null);

  if (last === undefined) {
    const base = toMinutes(fallback);
    return toTime(base ?? 20 * 60);
  }

  for (let step = 1; step <= 24; step += 1) {
    const candidate = (last + step * 60) % MINUTES_PER_DAY;
    if (!taken.has(candidate)) {
      return toTime(candidate);
    }
  }

  for (let step = 1; step < MINUTES_PER_DAY; step += 1) {
    const candidate = (last + step) % MINUTES_PER_DAY;
    if (!taken.has(candidate)) {
      return toTime(candidate);
    }
  }

  return toTime(last);
}
