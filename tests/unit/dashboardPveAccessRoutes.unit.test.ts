import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireManageableDashboardGuild = vi.fn();
const getGuildRoles = vi.fn();
const validateAccessUsers = vi.fn();
const fetchMemberRoleIds = vi.fn();
const searchChannelMembers = vi.fn();
const updatePveEventAccess = vi.fn();
const syncPublishedEventMessage = vi.fn();
const prisma = { event: { findFirst: vi.fn() } };

vi.mock("@/lib/server/apiErrors", async () => await vi.importActual("../../apps/dashboard/lib/server/apiErrors"));
vi.mock("@/lib/server/guildAccess", () => ({ requireManageableDashboardGuild }));
vi.mock("@/lib/server/prisma", () => ({ prisma }));
vi.mock("@/lib/server/discordGuildConfig", () => ({ getGuildRoles }));
vi.mock("@/lib/server/discordMemberAccess", () => ({ validateAccessUsers, fetchMemberRoleIds, searchChannelMembers }));
vi.mock("@/lib/server/dashboardData", () => ({ updatePveEventAccess }));
vi.mock("@/lib/server/eventMessageSync", () => ({ syncPublishedEventMessage }));

const GUILD_ID = "100000000000000001";
const CHANNEL_ID = "200000000000000002";
const ROLE_ID = "300000000000000003";
const USER_A = "400000000000000004";
const USER_B = "400000000000000005";

const { PUT } = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/[eventId]/access/route");
const { GET } = await import("../../apps/dashboard/app/api/guilds/[guildId]/members/route");

function putAccess(body: unknown) {
  return PUT(
    new Request("http://localhost/api", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ guildId: GUILD_ID, eventId: "event_1" }) }
  );
}

function searchMembers(query: string) {
  return GET(new Request(`http://localhost/api?${query}`), { params: Promise.resolve({ guildId: GUILD_ID }) });
}

describe("PUT /api/guilds/[guildId]/events/[eventId]/access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: GUILD_ID, manageable: true }, availableGuilds: [], session: {} });
    prisma.event.findFirst.mockResolvedValue({ id: "event_1", eventType: "pve", channelId: CHANNEL_ID, messageId: null });
    getGuildRoles.mockResolvedValue([{ id: ROLE_ID, name: "Guild" }]);
    validateAccessUsers.mockImplementation(async (_guildId: string, userIds: string[]) => ({ allowed: userIds, rejected: [] }));
    updatePveEventAccess.mockResolvedValue({ promoted: [{ userId: "filler_1", displayName: "Filler", optionLabel: "20:00", optionId: "o1", isFake: false }] });
    fetchMemberRoleIds.mockResolvedValue([ROLE_ID]);
  });

  it("rejects by roles without roles and by people without people", async () => {
    expect((await putAccess({ accessMode: "ROLES", roleIds: [], userIds: [] })).status).toBe(400);
    expect((await putAccess({ accessMode: "USERS", roleIds: [], userIds: [] })).status).toBe(400);
    expect(updatePveEventAccess).not.toHaveBeenCalled();
  });

  it("only PvE events of this guild can be edited", async () => {
    prisma.event.findFirst.mockResolvedValueOnce(null);
    expect((await putAccess({ accessMode: "OPEN" })).status).toBe(404);
    prisma.event.findFirst.mockResolvedValueOnce({ id: "event_1", eventType: "war", channelId: CHANNEL_ID, messageId: null });
    expect((await putAccess({ accessMode: "OPEN" })).status).toBe(400);
  });

  it("rejects roles from another guild and people who cannot see the event channel", async () => {
    expect((await putAccess({ accessMode: "ROLES", roleIds: ["999999999999999999"] })).status).toBe(400);

    validateAccessUsers.mockResolvedValueOnce({ allowed: [USER_A], rejected: [USER_B] });
    const response = await putAccess({ accessMode: "USERS", userIds: [USER_A, USER_B] });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ rejectedUserIds: [USER_B] });
    expect(validateAccessUsers).toHaveBeenLastCalledWith(GUILD_ID, [USER_A, USER_B], CHANNEL_ID);
    expect(updatePveEventAccess).not.toHaveBeenCalled();
  });

  it("only checks the list of the chosen mode, so an old entry in the other list cannot block saving", async () => {
    const response = await putAccess({ accessMode: "OPEN", roleIds: ["999999999999999999"], userIds: [USER_A] });

    expect(response.status).toBe(200);
    expect(getGuildRoles).not.toHaveBeenCalled();
    expect(validateAccessUsers).not.toHaveBeenCalled();
    expect(updatePveEventAccess).toHaveBeenCalledTimes(1);
  });

  it("saves the access, re-checks fillers with each member's roles and reports who moved up", async () => {
    const response = await putAccess({ accessMode: "ROLES", roleIds: [ROLE_ID], userIds: [USER_A] });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, synced: false, promoted: [{ userId: "filler_1", optionLabel: "20:00" }] });
    const [guildId, eventId, input, options] = updatePveEventAccess.mock.calls[0];
    expect([guildId, eventId, input]).toEqual([GUILD_ID, "event_1", { accessMode: "ROLES", roleIds: [ROLE_ID], userIds: [USER_A] }]);
    await expect(options.resolveMemberRoleIds(USER_B)).resolves.toEqual([ROLE_ID]);
    expect(fetchMemberRoleIds).toHaveBeenCalledWith(GUILD_ID, USER_B);
    expect(syncPublishedEventMessage).not.toHaveBeenCalled();
  });

  it("refreshes the Discord message of a published event and still saves when that fails", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event_1", eventType: "pve", channelId: CHANNEL_ID, messageId: "800000000000000008" });
    syncPublishedEventMessage.mockResolvedValueOnce({ ok: true });
    let response = await putAccess({ accessMode: "OPEN" });
    await expect(response.json()).resolves.toMatchObject({ ok: true, synced: true });
    expect(syncPublishedEventMessage).toHaveBeenCalledWith(GUILD_ID, "event_1");

    syncPublishedEventMessage.mockResolvedValueOnce({ ok: false, status: 403, error: "Missing permissions." });
    response = await putAccess({ accessMode: "OPEN" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, synced: false, syncError: "Missing permissions." });
  });
});

describe("GET /api/guilds/[guildId]/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: GUILD_ID, manageable: true }, availableGuilds: [], session: {} });
    searchChannelMembers.mockResolvedValue([{ id: USER_A, displayName: "Alice", username: "alice", avatarUrl: null, canViewChannel: true }]);
  });

  it("searches members by name for the event channel", async () => {
    const response = await searchMembers(`query=al&channelId=${CHANNEL_ID}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ members: [{ id: USER_A, displayName: "Alice", username: "alice", avatarUrl: null, canViewChannel: true }] });
    expect(searchChannelMembers).toHaveBeenCalledWith(GUILD_ID, "al", CHANNEL_ID);
  });

  it("needs a query and a valid channel id", async () => {
    expect((await searchMembers("query=")).status).toBe(400);
    expect((await searchMembers("query=al&channelId=../users")).status).toBe(400);
    expect(searchChannelMembers).not.toHaveBeenCalled();
  });
});
