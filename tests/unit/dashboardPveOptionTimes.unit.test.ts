import { describe, expect, it } from "vitest";
import { suggestNextOptionTime } from "../../apps/dashboard/lib/pveOptionTimes";

describe("suggestNextOptionTime", () => {
  it("proposes the hour after the last option", () => {
    expect(suggestNextOptionTime(["20:00"])).toBe("21:00");
    expect(suggestNextOptionTime(["20:00", "21:00"])).toBe("22:00");
    expect(suggestNextOptionTime(["20:30"])).toBe("21:30");
  });

  it("never proposes a time that is already taken", () => {
    expect(suggestNextOptionTime(["20:00", "22:00", "21:00"])).toBe("23:00");
    expect(suggestNextOptionTime(["21:00", "22:00", "20:00"])).toBe("23:00");
  });

  it("wraps around midnight", () => {
    expect(suggestNextOptionTime(["22:00", "23:00"])).toBe("00:00");
    expect(suggestNextOptionTime(["23:00", "00:00"])).toBe("01:00");
  });

  it("understands single digit hours and ignores unusable entries", () => {
    expect(suggestNextOptionTime(["9:00"])).toBe("10:00");
    expect(suggestNextOptionTime(["20:00", ""])).toBe("21:00");
    expect(suggestNextOptionTime(["20:00", "not a time", "25:99"])).toBe("21:00");
  });

  it("uses the fallback, or 20:00, when there is no usable option", () => {
    expect(suggestNextOptionTime([])).toBe("20:00");
    expect(suggestNextOptionTime([], "18:15")).toBe("18:15");
    expect(suggestNextOptionTime(["", "x"], "18:15")).toBe("18:15");
    expect(suggestNextOptionTime([], "garbage")).toBe("20:00");
  });

  it("still finds a free time when every full hour is taken", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
    const suggestion = suggestNextOptionTime(hours);

    expect(suggestion).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    expect(hours).not.toContain(suggestion);
  });
});
