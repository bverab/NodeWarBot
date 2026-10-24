import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/eventDateTime", () => ({
  buildEventDateTime: ({ date, time }: { date: string; time: string }) => new Date(`${date}T${time}:00.000Z`),
  normalizeTimezoneInfo: (value: string | null | undefined) => {
    const raw = String(value || "").trim();
    if (!raw) {
      return { timezone: "America/Santiago", source: "fallback" };
    }
    if (raw === "America/Chile" || raw === "America/Santiago") {
      return { timezone: "America/Santiago", source: raw === "America/Chile" ? "alias" : "exact" };
    }
    if (raw === "America/Bogota") {
      return { timezone: "America/Bogota", source: "exact" };
    }
    return { timezone: "America/Santiago", source: "fallback" };
  }
}));

const {
  getLockedPublishedEventPatchFields,
  normalizeTimeInput,
  parseEventPatch,
  parseRoleSlotPatch,
  parseSlotReorder,
  parseTemplatePatch,
  readJsonObject
} = await import("../../apps/dashboard/lib/server/mutationValidation");

describe("dashboard mutation validation", () => {
  it("normalizes valid HH:mm values", () => {
    expect(normalizeTimeInput("18:58")).toBe("18:58");
    expect(normalizeTimeInput("09:00")).toBe("09:00");
    expect(normalizeTimeInput("9:00")).toBe("09:00");
    expect(normalizeTimeInput("23:30")).toBe("23:30");
  });

  it("rejects invalid time values clearly", () => {
    expect(normalizeTimeInput("24:00")).toBeNull();
    expect(normalizeTimeInput("18:99")).toBeNull();
    expect(normalizeTimeInput("nope")).toBeNull();
    expect(parseEventPatch({ time: "24:00" })).toEqual({ error: "Time must use HH:mm format." });
  });

  it("identifies schedule and publication fields locked after publish", () => {
    expect(getLockedPublishedEventPatchFields({
      name: "Safe",
      type: "Safe label",
      time: "18:58",
      channelId: "693672286532272130",
      messageId: "1500000000000000001",
      duration: 70
    })).toEqual(["time", "duration", "channelId", "messageId"]);
  });

  it("accepts Discord snowflakes for channelId and messageId and clears them with an empty string", () => {
    expect(parseEventPatch({ channelId: "693672286532272130", messageId: "1500000000000000001" })).toEqual({
      patch: { channelId: "693672286532272130", messageId: "1500000000000000001" }
    });
    expect(parseEventPatch({ channelId: "12345678901234567", messageId: "12345678901234567890" })).toEqual({
      patch: { channelId: "12345678901234567", messageId: "12345678901234567890" }
    });
    expect(parseEventPatch({ channelId: "  ", messageId: "" })).toEqual({ patch: { channelId: null, messageId: null } });
  });

  it("rejects channelId and messageId values that are not Discord snowflakes", () => {
    expect(parseEventPatch({ channelId: "channel_1" })).toEqual({ error: "channelId must be a valid Discord ID (17-20 digits)." });
    expect(parseEventPatch({ messageId: "message_1" })).toEqual({ error: "messageId must be a valid Discord ID (17-20 digits)." });
    expect(parseEventPatch({ messageId: "1234567890123456" })).toEqual({ error: "messageId must be a valid Discord ID (17-20 digits)." });
    expect(parseEventPatch({ messageId: "123456789012345678901" })).toEqual({ error: "messageId must be a valid Discord ID (17-20 digits)." });
    expect(parseEventPatch({ channelId: "../guilds/1/roles" })).toEqual({ error: "channelId must be a valid Discord ID (17-20 digits)." });
    // A long numeric string must not be silently truncated into something that looks valid.
    expect(parseEventPatch({ messageId: `${"1".repeat(17)}x${"1".repeat(20)}` })).toEqual({ error: "messageId must be a valid Discord ID (17-20 digits)." });
  });

  it("never lets the client set publishError or lastPublishAttemptAt through the patch", () => {
    const result = parseEventPatch({
      name: "Draft",
      publishError: "forged",
      lastPublishAttemptAt: "2026-01-01T00:00:00.000Z",
      scheduledPublishAt: "2026-01-01T00:00:00.000Z"
    });

    expect(result).toEqual({ patch: { name: "Draft" } });
  });

  it("accepts the realistic dashboard edit payload and normalizes form strings", () => {
    const result = parseEventPatch({
      name: "Test Web App",
      type: "war",
      eventType: "war",
      time: "23:00",
      timezone: "America/Bogota",
      duration: "3",
      closeBeforeMinutes: "2",
      channelId: "693672286532272130",
      messageId: ""
    }, { timezone: "America/Bogota" });

    expect(result).toEqual({
      patch: {
        name: "Test Web App",
        type: "war",
        eventType: "war",
        time: "23:00",
        timezone: "America/Bogota",
        duration: 3,
        closeBeforeMinutes: 2,
        channelId: "693672286532272130",
        messageId: null
      }
    });
  });

  it("normalizes legacy America/Chile edit payloads to America/Santiago", () => {
    const result = parseEventPatch({
      name: "Chile alias event",
      time: "23:22",
      timezone: "America/Chile",
      duration: "6",
      closeBeforeMinutes: "3"
    }, { timezone: "America/Chile" });

    expect(result).toEqual({
      patch: {
        name: "Chile alias event",
        time: "23:22",
        timezone: "America/Santiago",
        duration: 6,
        closeBeforeMinutes: 3
      }
    });
  });

  it("returns a controlled validation error for unknown timezones", () => {
    expect(parseEventPatch({ timezone: "Mars/Olympus" })).toEqual({ error: "Timezone must be a valid IANA timezone." });
  });

  it("accepts scheduled publish changes for draft edit payloads", () => {
    const result = parseEventPatch({
      autoPublishEnabled: true
    });

    expect(result).toEqual({ patch: { autoPublishEnabled: true } });
  });

  it("locks scheduled publish fields after publishing", () => {
    expect(getLockedPublishedEventPatchFields({
      name: "Safe",
      autoPublishEnabled: true,
      publishBeforeMinutes: 60,
      scheduledPublishAt: "2026-05-05T22:00:00.000Z"
    })).toEqual(["autoPublishEnabled", "scheduledPublishAt", "publishBeforeMinutes"]);
  });

  it("normalizes role slot allowed role IDs", () => {
    expect(parseRoleSlotPatch({
      name: "Flex",
      max: "3",
      allowedRoleIds: ["12345", "12345", "67890"]
    })).toEqual({
      patch: {
        name: "Flex",
        max: 3,
        allowedRoleIds: ["12345", "67890"]
      }
    });
  });

  it("rejects invalid role slot allowed role IDs", () => {
    expect(parseRoleSlotPatch({ allowedRoleIds: ["abc"] })).toEqual({
      error: "Allowed role IDs must be valid Discord role IDs."
    });
  });

  describe("bodies that are not JSON objects", () => {
    const invalidBodies: unknown[] = [null, undefined, [], [1], "text", 42, true];

    it("makes every patch parser answer with an error instead of throwing", () => {
      for (const body of invalidBodies) {
        expect(parseEventPatch(body as never)).toEqual({ error: "Request body must be a JSON object." });
        expect(parseTemplatePatch(body as never)).toEqual({ error: "Request body must be a JSON object." });
        expect(parseRoleSlotPatch(body as never)).toEqual({ error: "Request body must be a JSON object." });
        expect(parseRoleSlotPatch(body as never, true)).toEqual({ error: "Request body must be a JSON object." });
      }
    });

    it("readJsonObject returns the object, or null for invalid JSON and non-object values", async () => {
      const read = (raw: string) => readJsonObject(new Request("http://localhost/api", { method: "POST", body: raw }));

      await expect(read('{"name":"Flex"}')).resolves.toEqual({ name: "Flex" });
      await expect(read("null")).resolves.toBeNull();
      await expect(read("[]")).resolves.toBeNull();
      await expect(read('"text"')).resolves.toBeNull();
      await expect(read("42")).resolves.toBeNull();
      await expect(read("{ not json")).resolves.toBeNull();
      await expect(read("")).resolves.toBeNull();
    });
  });

  describe("parseSlotReorder", () => {
    it("normalizes a valid payload", () => {
      expect(parseSlotReorder([{ id: "a", order: 2 }, { id: "b", order: "1" }, { id: "c", order: 3.9 }])).toEqual({
        slots: [{ id: "a", order: 2 }, { id: "b", order: 1 }, { id: "c", order: 3 }]
      });
    });

    it("rejects payloads that are not an array of {id, order}", () => {
      for (const value of [undefined, null, {}, "x", [null], [{ id: "", order: 1 }], [{ id: "a" }], [{ id: "a", order: "x" }], [{ id: 5, order: 1 }]]) {
        expect(parseSlotReorder(value)).toEqual({ error: "Invalid slot order payload." });
      }
    });

    it("allows at most 100 slots", () => {
      const build = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `slot_${index}`, order: index + 1 }));

      expect(parseSlotReorder(build(100))).toMatchObject({ slots: expect.any(Array) });
      expect(parseSlotReorder(build(101))).toEqual({ error: "Too many slots (maximum 100)." });
    });

    it("rejects repeated slot ids and repeated positions", () => {
      expect(parseSlotReorder([{ id: "a", order: 1 }, { id: "a", order: 2 }])).toEqual({ error: "Duplicate slot IDs are not allowed." });
      expect(parseSlotReorder([{ id: "a", order: 1 }, { id: "b", order: 1 }])).toEqual({ error: "Slot positions must be unique." });
      // 0 and a negative number are both clamped to position 1, so they collide too.
      expect(parseSlotReorder([{ id: "a", order: 0 }, { id: "b", order: -4 }])).toEqual({ error: "Slot positions must be unique." });
    });
  });
});
