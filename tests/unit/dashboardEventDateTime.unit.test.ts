import { describe, expect, it } from "vitest";
import {
  buildEventDateTime,
  calculateEventLifecycleDates,
  calculateScheduledPublishAt,
  formatDateTimeInTimezone,
  isValidTimeZone,
  normalizeTimezone
} from "../../apps/dashboard/lib/eventDateTime";

function local(value: Date | null, timezone: string) {
  return formatDateTimeInTimezone(value, timezone);
}

describe("dashboard event date/time timezone helpers", () => {
  it("normalizes the legacy Chile alias to America/Santiago", () => {
    expect(normalizeTimezone("America/Chile")).toBe("America/Santiago");
    expect(isValidTimeZone("America/Santiago")).toBe(true);
    expect(isValidTimeZone("America/Chile")).toBe(false);
  });

  it("keeps America/Santiago date and time stable", () => {
    const startsAt = buildEventDateTime({ date: "2026-05-05", time: "18:58", timezone: "America/Santiago" });

    expect(local(startsAt, "America/Santiago")).toBe("05 May 2026, 18:58");
  });

  it("keeps America/Bogota date and time stable", () => {
    const startsAt = buildEventDateTime({ date: "2026-05-05", time: "09:00", timezone: "America/Bogota" });

    expect(local(startsAt, "America/Bogota")).toBe("05 May 2026, 09:00");
  });

  it("supports evening and near-midnight start times without changing the local day", () => {
    expect(local(buildEventDateTime({ date: "2026-05-05", time: "23:30", timezone: "America/Santiago" }), "America/Santiago")).toBe("05 May 2026, 23:30");
    expect(local(buildEventDateTime({ date: "2026-05-05", time: "00:05", timezone: "America/Santiago" }), "America/Santiago")).toBe("05 May 2026, 00:05");
  });

  it("calculates expiresAt and closesAt from start, duration, and close-before-end", () => {
    const lifecycle = calculateEventLifecycleDates({
      date: "2026-05-05",
      time: "18:58",
      timezone: "America/Santiago",
      duration: 6,
      closeBeforeMinutes: 3
    });

    expect(local(lifecycle?.startsAt ?? null, "America/Santiago")).toBe("05 May 2026, 18:58");
    expect(local(lifecycle?.expiresAt ?? null, "America/Santiago")).toBe("05 May 2026, 19:04");
    expect(local(lifecycle?.closesAt ?? null, "America/Santiago")).toBe("05 May 2026, 19:01");
  });

  it("matches the real dashboard creation payload for 22:38 America/Santiago", () => {
    const lifecycle = calculateEventLifecycleDates({
      date: "2026-05-05",
      time: "22:38",
      timezone: "America/Santiago",
      duration: 6,
      closeBeforeMinutes: 3
    });

    expect(local(lifecycle?.startsAt ?? null, "America/Santiago")).toBe("05 May 2026, 22:38");
    expect(local(lifecycle?.closesAt ?? null, "America/Santiago")).toBe("05 May 2026, 22:41");
    expect(local(lifecycle?.expiresAt ?? null, "America/Santiago")).toBe("05 May 2026, 22:44");
  });

  it("calculates scheduled publish before event start", () => {
    const startsAt = buildEventDateTime({ date: "2026-05-05", time: "23:00", timezone: "America/Santiago" });
    const scheduled = calculateScheduledPublishAt({ startsAt, publishBeforeMinutes: 60 });

    expect(local(scheduled, "America/Santiago")).toBe("05 May 2026, 22:00");
  });

  it("calculates scheduled publish across midnight", () => {
    const startsAt = buildEventDateTime({ date: "2026-05-05", time: "00:30", timezone: "America/Bogota" });
    const scheduled = calculateScheduledPublishAt({ startsAt, publishBeforeMinutes: 60 });

    expect(local(scheduled, "America/Bogota")).toBe("04 May 2026, 23:30");
  });

  it("accepts the legacy America/Chile alias for lifecycle calculations", () => {
    const lifecycle = calculateEventLifecycleDates({
      date: "2026-05-05",
      time: "23:22",
      timezone: "America/Chile",
      duration: 6,
      closeBeforeMinutes: 3
    });

    expect(local(lifecycle?.startsAt ?? null, "America/Santiago")).toBe("05 May 2026, 23:22");
    expect(local(lifecycle?.closesAt ?? null, "America/Santiago")).toBe("05 May 2026, 23:25");
    expect(local(lifecycle?.expiresAt ?? null, "America/Santiago")).toBe("05 May 2026, 23:28");
  });


  it("rejects invalid calendar or time inputs", () => {
    expect(buildEventDateTime({ date: "2026-02-31", time: "18:58", timezone: "America/Santiago" })).toBeNull();
    expect(buildEventDateTime({ date: "2026-05-05", time: "24:00", timezone: "America/Santiago" })).toBeNull();
  });
});
