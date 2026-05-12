import { describe, expect, it, vi } from "vitest";
import { setupIntegrationSuite } from "../helpers/dbTestHarness";
import { prisma } from "../../src/db/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/eventDateTime", async () => await vi.importActual("../../apps/dashboard/lib/eventDateTime"));
vi.mock("@/lib/server/discordMembers", () => ({
  fetchDiscordGuildMembers: vi.fn(async () => new Map())
}));
vi.mock("@/lib/server/prisma", async () => {
  const { prisma } = await import("../../src/db/client");
  return { prisma };
});

setupIntegrationSuite();

const baseInput = {
  name: "Recurrence Test",
  eventType: "war",
  type: "Node War",
  date: "2026-05-05",
  time: "22:38",
  timezone: "America/Santiago",
  duration: 60,
  closeBeforeMinutes: 10,
  channelId: null,
  autoPublishEnabled: false,
  slots: [{ name: "Flex", max: 5, position: 0, emoji: null, emojiSource: null, allowedRoleIds: [] }]
};

describe("dashboard recurrence creation", () => {
  it("creates single events as one-time occurrences", async () => {
    const { createGuildEventDraft } = await import("../../apps/dashboard/lib/server/dashboardData");
    const event = await createGuildEventDraft("guild_recurrence", "creator_1", {
      ...baseInput,
      recurrence: "single"
    });

    const persisted = await prisma.event.findUnique({
      where: { id: event.id },
      include: { schedule: true }
    });

    expect(persisted?.groupId).toBeNull();
    expect(persisted?.dayOfWeek).toBeNull();
    expect(persisted?.schedule?.mode).toBe("once");
    expect(persisted?.schedule?.enabled).toBe(false);
  });

  it("creates weekly events as recurring series records", async () => {
    const { createGuildEventDraft } = await import("../../apps/dashboard/lib/server/dashboardData");
    const event = await createGuildEventDraft("guild_recurrence", "creator_1", {
      ...baseInput,
      name: "Weekly Recurrence Test",
      recurrence: "weekly"
    });

    const persisted = await prisma.event.findUnique({
      where: { id: event.id },
      include: { schedule: true }
    });

    expect(persisted?.groupId).toMatch(/^web_series_/);
    expect(persisted?.dayOfWeek).toBe(2);
    expect(persisted?.schedule?.mode).toBe("recurring");
    expect(persisted?.schedule?.enabled).toBe(true);
  });
});
