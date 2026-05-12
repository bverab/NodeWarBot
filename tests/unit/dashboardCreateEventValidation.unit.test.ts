import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/eventDateTime", async () => {
  const actual = await import("../../apps/dashboard/lib/eventDateTime");
  return actual;
});

describe("dashboard create event validation", () => {
  it("accepts the real War create payload with 22:38 America/Santiago", async () => {
    const { createEventSchema } = await import("../../apps/dashboard/lib/server/createEventValidation");

    const result = createEventSchema.safeParse({
      name: "Test war",
      eventType: "war",
      type: "Evento de guerra",
      date: "2026-05-05",
      time: "22:38",
      timezone: "America/Santiago",
      duration: 6,
      closeBeforeMinutes: 3,
      channelId: null,
      accessRoleIds: [],
      notifyRoleIds: [],
      recurrence: "single",
      recap: {
        enabled: false,
        minutesBeforeExpire: 0,
        messageText: "Resumen del evento"
      },
      slots: [
        {
          name: "Flex",
          max: 5,
          position: 1,
          emoji: null,
          emojiSource: null,
          allowedRoleIds: []
        }
      ]
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.time).toBe("22:38");
      expect(result.data.timezone).toBe("America/Santiago");
    }
  });

  it("normalizes legacy America/Chile create payloads", async () => {
    const { createEventSchema } = await import("../../apps/dashboard/lib/server/createEventValidation");

    const result = createEventSchema.safeParse({
      name: "Chile alias war",
      eventType: "war",
      type: "Evento de guerra",
      date: "2026-05-05",
      time: "23:22",
      timezone: "America/Chile",
      duration: 6,
      closeBeforeMinutes: 3,
      channelId: null,
      slots: [{ name: "Flex", max: 5, position: 1, emoji: null, emojiSource: null, allowedRoleIds: [] }]
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe("America/Santiago");
    }
  });

  it("allows manual publish drafts without channelId", async () => {
    const { createEventSchema } = await import("../../apps/dashboard/lib/server/createEventValidation");

    const result = createEventSchema.safeParse({
      name: "Manual draft",
      eventType: "war",
      type: "Evento de guerra",
      date: "2026-05-05",
      time: "23:00",
      timezone: "America/Santiago",
      duration: 60,
      closeBeforeMinutes: 0,
      channelId: null,
      autoPublishEnabled: false,
      slots: [{ name: "Flex", max: 5, position: 1, emoji: null, emojiSource: null, allowedRoleIds: [] }]
    });

    expect(result.success).toBe(true);
  });

  it("requires channelId when scheduled auto publish is enabled", async () => {
    const { createEventSchema } = await import("../../apps/dashboard/lib/server/createEventValidation");

    const result = createEventSchema.safeParse({
      name: "Scheduled draft",
      eventType: "war",
      type: "Evento de guerra",
      date: "2026-05-05",
      time: "23:00",
      timezone: "America/Santiago",
      duration: 60,
      closeBeforeMinutes: 0,
      channelId: null,
      autoPublishEnabled: true,
      publishBeforeMinutes: 60,
      slots: [{ name: "Flex", max: 5, position: 1, emoji: null, emojiSource: null, allowedRoleIds: [] }]
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "channelId")).toBe(true);
    }
  });
});
