import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireManageableDashboardGuild = vi.fn();
const validateBotCanPublishToChannel = vi.fn();
const createDiscordRestGuildAdapter = vi.fn();
const deleteDiscordMessageByRest = vi.fn();
const publishEventToDiscord = vi.fn();
const mapDbEventToDiscordDomain = vi.fn();
const markEventPublished = vi.fn();
const prisma = { event: { findFirst: vi.fn() } };

vi.mock("@/lib/server/apiErrors", async () => await vi.importActual("../../apps/dashboard/lib/server/apiErrors"));
vi.mock("@/lib/server/publishGuards", async () => await vi.importActual("../../apps/dashboard/lib/server/publishGuards"));
vi.mock("@/lib/server/guildAccess", () => ({ requireManageableDashboardGuild }));
vi.mock("@/lib/server/prisma", () => ({ prisma }));
vi.mock("@/lib/server/dashboardData", () => ({ markEventPublished }));
vi.mock("@/lib/server/eventDomainMapper", () => ({ mapDbEventToDiscordDomain }));
vi.mock("@/lib/server/nodeWarBotServices", () => ({ publishEventToDiscord }));
vi.mock("@/lib/server/discordRestEventAdapter", () => ({
  validateBotCanPublishToChannel,
  createDiscordRestGuildAdapter,
  deleteDiscordMessageByRest
}));

const GUILD_ID = "100000000000000001";
const CHANNEL_ID = "200000000000000002";
const MESSAGE_ID = "300000000000000003";
const HOUR = 60 * 60 * 1000;

const { POST } = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/[eventId]/publish/route");

function dbEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event_1",
    guildId: GUILD_ID,
    eventType: "war",
    accessMode: "OPEN",
    messageId: null,
    channelId: CHANNEL_ID,
    isClosed: false,
    closesAt: new Date(Date.now() + HOUR),
    expiresAt: new Date(Date.now() + 2 * HOUR),
    notifyTargets: [],
    accessUsers: [],
    ...overrides
  };
}

function publish() {
  return POST(new Request("http://localhost/api", { method: "POST" }), { params: Promise.resolve({ guildId: GUILD_ID, eventId: "event_1" }) });
}

describe("POST /api/guilds/[guildId]/events/[eventId]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: GUILD_ID, manageable: true }, availableGuilds: [], session: {} });
    prisma.event.findFirst.mockResolvedValue(dbEvent());
    markEventPublished.mockResolvedValue(true);
    validateBotCanPublishToChannel.mockResolvedValue({ ok: true, channel: { id: CHANNEL_ID }, botUserId: "400000000000000004" });
    createDiscordRestGuildAdapter.mockReturnValue({ channels: { fetch: vi.fn() } });
    mapDbEventToDiscordDomain.mockReturnValue({ id: "event_1" });
    publishEventToDiscord.mockResolvedValue({ ok: true, status: "published", messageId: MESSAGE_ID, channelId: CHANNEL_ID, errorCode: null, errorMessage: null });
  });

  it("publishes an open event and validates the channel only once", async () => {
    const response = await publish();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, messageId: MESSAGE_ID });
    expect(validateBotCanPublishToChannel).toHaveBeenCalledTimes(1);
    expect(createDiscordRestGuildAdapter).toHaveBeenCalledWith(GUILD_ID, { validatedChannel: { id: CHANNEL_ID } });
    // Message, channel and the publish time (schedule.lastCreatedAt) are stored together by one data-layer call.
    expect(markEventPublished).toHaveBeenCalledTimes(1);
    expect(markEventPublished).toHaveBeenCalledWith(GUILD_ID, "event_1", { channelId: CHANNEL_ID, messageId: MESSAGE_ID, publishedAt: expect.any(Date) });
  });

  it("refuses to publish a closed event before touching Discord", async () => {
    prisma.event.findFirst.mockResolvedValue(dbEvent({ isClosed: true }));

    const response = await publish();

    expect(response.status).toBe(409);
    expect(validateBotCanPublishToChannel).not.toHaveBeenCalled();
    expect(publishEventToDiscord).not.toHaveBeenCalled();
  });

  it("refuses to publish an event that already expired or whose signups are over", async () => {
    prisma.event.findFirst.mockResolvedValue(dbEvent({ expiresAt: new Date(Date.now() - 1000) }));
    expect((await publish()).status).toBe(409);

    prisma.event.findFirst.mockResolvedValue(dbEvent({ closesAt: new Date(Date.now() - 1000) }));
    expect((await publish()).status).toBe(409);

    expect(publishEventToDiscord).not.toHaveBeenCalled();
  });

  it("keeps answering 409 for an event that is already published", async () => {
    prisma.event.findFirst.mockResolvedValue(dbEvent({ messageId: MESSAGE_ID, isClosed: true }));

    const response = await publish();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Event is already published to Discord." });
  });

  it("answers JSON instead of throwing when something unexpected fails", async () => {
    prisma.event.findFirst.mockRejectedValue(new Error("SQLITE_BUSY: database is locked"));

    const response = await publish();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to publish event." });
  });

  it("answers JSON when the Discord publish itself throws", async () => {
    publishEventToDiscord.mockRejectedValue(new Error("fetch failed"));

    const response = await publish();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to publish event." });
    expect(markEventPublished).not.toHaveBeenCalled();
  });

  it("compensates by deleting the Discord message when another request published first", async () => {
    markEventPublished.mockResolvedValue(false);
    deleteDiscordMessageByRest.mockResolvedValue(undefined);

    const response = await publish();

    expect(response.status).toBe(409);
    expect(deleteDiscordMessageByRest).toHaveBeenCalledWith(CHANNEL_ID, MESSAGE_ID);
  });

  it("deletes the Discord message and says so when saving the publication fails", async () => {
    markEventPublished.mockRejectedValue(new Error("SQLITE_BUSY: database is locked"));
    deleteDiscordMessageByRest.mockResolvedValue(undefined);

    const response = await publish();

    expect(response.status).toBe(500);
    expect(deleteDiscordMessageByRest).toHaveBeenCalledWith(CHANNEL_ID, MESSAGE_ID);
  });
});

describe("POST /api/guilds/[guildId]/events/[eventId]/publish: PvE access mentions", () => {
  const ROLE_ID = "500000000000000005";
  const USER_ID = "600000000000000006";
  const NOTIFY_ROLE_ID = "700000000000000007";

  beforeEach(() => {
    vi.clearAllMocks();
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: GUILD_ID, manageable: true }, availableGuilds: [], session: {} });
    markEventPublished.mockResolvedValue(true);
    validateBotCanPublishToChannel.mockResolvedValue({ ok: true, channel: { id: CHANNEL_ID }, botUserId: "400000000000000004" });
    createDiscordRestGuildAdapter.mockReturnValue({ channels: { fetch: vi.fn() } });
    mapDbEventToDiscordDomain.mockReturnValue({ id: "event_1" });
    publishEventToDiscord.mockResolvedValue({ ok: true, status: "published", messageId: MESSAGE_ID, channelId: CHANNEL_ID, errorCode: null, errorMessage: null });
  });

  async function mentionsFor(overrides: Record<string, unknown>) {
    prisma.event.findFirst.mockResolvedValue(dbEvent({
      eventType: "pve",
      notifyTargets: [{ targetId: NOTIFY_ROLE_ID }],
      accessRoles: [{ roleId: ROLE_ID }],
      accessUsers: [{ userId: USER_ID }],
      ...overrides
    }));
    const response = await publish();
    expect(response.status).toBe(200);
    return publishEventToDiscord.mock.calls[0][0].messageOptions;
  }

  it("by roles mentions the roles with access", async () => {
    await expect(mentionsFor({ accessMode: "ROLES" })).resolves.toEqual({ content: `<@&${ROLE_ID}>`, allowedMentions: { parse: [], roles: [ROLE_ID] } });
  });

  it("by people (and the former RESTRICTED mode) mentions the people with access", async () => {
    const expected = { content: `<@${USER_ID}>`, allowedMentions: { parse: [], users: [USER_ID] } };
    await expect(mentionsFor({ accessMode: "USERS" })).resolves.toEqual(expected);
    vi.clearAllMocks();
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: GUILD_ID, manageable: true }, availableGuilds: [], session: {} });
    markEventPublished.mockResolvedValue(true);
    validateBotCanPublishToChannel.mockResolvedValue({ ok: true, channel: { id: CHANNEL_ID }, botUserId: "400000000000000004" });
    publishEventToDiscord.mockResolvedValue({ ok: true, status: "published", messageId: MESSAGE_ID, channelId: CHANNEL_ID, errorCode: null, errorMessage: null });
    await expect(mentionsFor({ accessMode: "RESTRICTED" })).resolves.toEqual(expected);
  });

  it("open PvE events mention the notify roles", async () => {
    await expect(mentionsFor({ accessMode: "OPEN" })).resolves.toEqual({ content: `<@&${NOTIFY_ROLE_ID}>`, allowedMentions: { parse: [], roles: [NOTIFY_ROLE_ID] } });
  });
});
