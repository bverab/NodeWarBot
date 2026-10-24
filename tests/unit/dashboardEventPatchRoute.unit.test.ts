import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireDashboardGuild = vi.fn();
const requireManageableDashboardGuild = vi.fn();
const getGuildEventDetail = vi.fn();
const updateGuildEvent = vi.fn();
const validateDraftEventLinks = vi.fn();
const prisma = {
  event: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  $transaction: vi.fn()
};

vi.mock("@/lib/eventDateTime", async () => await vi.importActual("../../apps/dashboard/lib/eventDateTime"));
vi.mock("@/lib/server/apiErrors", async () => await vi.importActual("../../apps/dashboard/lib/server/apiErrors"));
vi.mock("@/lib/server/mutationValidation", async () => await vi.importActual("../../apps/dashboard/lib/server/mutationValidation"));
vi.mock("@/lib/server/guildAccess", () => ({ requireDashboardGuild, requireManageableDashboardGuild }));
vi.mock("@/lib/server/dashboardData", () => ({ getGuildEventDetail, updateGuildEvent }));
vi.mock("@/lib/server/draftEventLinks", () => ({ validateDraftEventLinks }));
vi.mock("@/lib/server/prisma", () => ({ prisma }));

const GUILD_ID = "100000000000000001";
const CHANNEL_ID = "200000000000000002";
const MESSAGE_ID = "300000000000000003";

const { PATCH } = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/[eventId]/route");

function draftEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event_1",
    groupId: null,
    messageId: null,
    time: "20:00",
    timezone: "America/Santiago",
    duration: 60,
    closeBeforeMinutes: 10,
    autoPublishEnabled: false,
    scheduledPublishAt: null,
    channelId: CHANNEL_ID,
    expiresAt: new Date("2030-05-05T21:00:00.000Z"),
    schedule: { enabled: false, mode: "once" },
    ...overrides
  };
}

function patchRequest(body: unknown) {
  return PATCH(
    new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    { params: Promise.resolve({ guildId: GUILD_ID, eventId: "event_1" }) }
  );
}

describe("PATCH /api/guilds/[guildId]/events/[eventId] draft links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: GUILD_ID, manageable: true }, availableGuilds: [], session: {} });
    prisma.event.findFirst.mockResolvedValue(draftEvent());
    prisma.event.findMany.mockResolvedValue([]);
    validateDraftEventLinks.mockResolvedValue({ ok: true });
    updateGuildEvent.mockResolvedValue({});
    getGuildEventDetail.mockResolvedValue({ id: "event_1" });
  });

  it("rejects a messageId that is not a snowflake without touching the database", async () => {
    const response = await patchRequest({ messageId: "message_1" });

    expect(response.status).toBe(400);
    expect(updateGuildEvent).not.toHaveBeenCalled();
    expect(validateDraftEventLinks).not.toHaveBeenCalled();
  });

  it("validates the channel and message link before storing them on a draft", async () => {
    const response = await patchRequest({ channelId: CHANNEL_ID, messageId: MESSAGE_ID });

    expect(response.status).toBe(200);
    expect(validateDraftEventLinks).toHaveBeenCalledWith({
      guildId: GUILD_ID,
      currentChannelId: CHANNEL_ID,
      patch: { channelId: CHANNEL_ID, messageId: MESSAGE_ID }
    });
    expect(updateGuildEvent).toHaveBeenCalledWith(GUILD_ID, "event_1", { channelId: CHANNEL_ID, messageId: MESSAGE_ID });
  });

  it("returns the Discord validation failure and stores nothing", async () => {
    validateDraftEventLinks.mockResolvedValue({ ok: false, status: 404, path: "messageId", error: "Discord message was not found in that channel." });

    const response = await patchRequest({ messageId: MESSAGE_ID });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Discord message was not found in that channel.",
      issues: [{ path: "messageId" }]
    });
    expect(updateGuildEvent).not.toHaveBeenCalled();
  });

  it("does not link a message to a whole recurring series", async () => {
    prisma.event.findFirst.mockResolvedValue(draftEvent({ groupId: "series_1", schedule: { enabled: true, mode: "recurring" } }));
    prisma.event.findMany.mockResolvedValue([draftEvent(), draftEvent({ id: "event_2" })]);

    const response = await patchRequest({ messageId: MESSAGE_ID, recurrenceScope: "series" });

    expect(response.status).toBe(400);
    expect(validateDraftEventLinks).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("keeps channel and message locked on published events", async () => {
    prisma.event.findFirst.mockResolvedValue(draftEvent({ messageId: MESSAGE_ID }));

    const response = await patchRequest({ messageId: "300000000000000004" });

    expect(response.status).toBe(409);
    expect(validateDraftEventLinks).not.toHaveBeenCalled();
    expect(updateGuildEvent).not.toHaveBeenCalled();
  });
});
