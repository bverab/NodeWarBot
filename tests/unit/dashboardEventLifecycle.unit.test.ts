import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/eventDateTime", () => ({
  calculateEventLifecycleDates: vi.fn()
}));
vi.mock("@/lib/server/discordMembers", () => ({
  fetchDiscordGuildMembers: vi.fn()
}));
vi.mock("@/lib/server/prisma", () => ({
  prisma: {}
}));

describe("dashboard event lifecycle helpers", () => {
  it("treats messageId as the publication boundary", async () => {
    const { canDeleteEventPermanently, isEventPublishedForDashboard } = await import("../../apps/dashboard/lib/server/dashboardData");

    expect(isEventPublishedForDashboard({ messageId: "message_1" })).toBe(true);
    expect(isEventPublishedForDashboard({ messageId: null })).toBe(false);
    expect(canDeleteEventPermanently({ messageId: null })).toBe(true);
    expect(canDeleteEventPermanently({ messageId: "message_1" })).toBe(false);
  });
});
