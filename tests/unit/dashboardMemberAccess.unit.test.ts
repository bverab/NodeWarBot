import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const GUILD_ID = "100000000000000001";
const CHANNEL_ID = "200000000000000002";
const ROLE_OK = "300000000000000003";
const ALICE = "400000000000000004";
const BOB = "400000000000000005";
const BOTTY = "400000000000000006";
const GHOST = "400000000000000007";
const VIEW_CHANNEL = String(0x400);

const members: Record<string, { nick: string; roles: string[]; bot?: boolean }> = {
  [ALICE]: { nick: "Alice", roles: [ROLE_OK] },
  [BOB]: { nick: "Bob", roles: [] },
  [BOTTY]: { nick: "Botty", roles: [], bot: true }
};

function memberPayload(id: string) {
  const member = members[id];
  return { nick: member.nick, roles: member.roles, user: { id, username: member.nick.toLowerCase(), bot: Boolean(member.bot) } };
}

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

// @everyone cannot see the channel; ROLE_OK can.
function mockDiscord() {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v10", "");
    if (path === `/guilds/${GUILD_ID}/members/search`) {
      expect(url.searchParams.get("limit")).toBe("25");
      return json([ALICE, BOB, BOTTY].map(memberPayload));
    }
    if (path === `/channels/${CHANNEL_ID}`) {
      return json({
        id: CHANNEL_ID,
        guild_id: GUILD_ID,
        type: 0,
        permission_overwrites: [
          { id: GUILD_ID, type: 0, allow: "0", deny: VIEW_CHANNEL },
          { id: ROLE_OK, type: 0, allow: VIEW_CHANNEL, deny: "0" }
        ]
      });
    }
    if (path === `/guilds/${GUILD_ID}/roles`) {
      return json([{ id: GUILD_ID, permissions: VIEW_CHANNEL }, { id: ROLE_OK, permissions: "0" }]);
    }
    const memberMatch = path.match(new RegExp(`^/guilds/${GUILD_ID}/members/(\\d+)$`));
    if (memberMatch) {
      return members[memberMatch[1]] ? json(memberPayload(memberMatch[1])) : json({ message: "Unknown Member", code: 10007 }, 404);
    }
    return json({ message: "unexpected" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("dashboard PvE member access", () => {
  beforeEach(() => {
    process.env.DISCORD_BOT_TOKEN = "test-token";
    mockDiscord();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches members, drops bots and says who can see the event channel", async () => {
    const { searchChannelMembers } = await import("../../apps/dashboard/lib/server/discordMemberAccess");

    const result = await searchChannelMembers(GUILD_ID, "a", CHANNEL_ID);

    expect(result.map((member) => [member.id, member.displayName, member.canViewChannel])).toEqual([
      [ALICE, "Alice", true],
      [BOB, "Bob", false]
    ]);
  });

  it("keeps only real members who can see the channel", async () => {
    const { validateAccessUsers } = await import("../../apps/dashboard/lib/server/discordMemberAccess");

    await expect(validateAccessUsers(GUILD_ID, [ALICE, BOB, BOTTY, GHOST, ALICE], CHANNEL_ID)).resolves.toEqual({
      allowed: [ALICE],
      rejected: [BOB, BOTTY, GHOST]
    });
    // Without a channel only membership and bots are checked.
    await expect(validateAccessUsers(GUILD_ID, [ALICE, BOB, GHOST], null)).resolves.toEqual({ allowed: [ALICE, BOB], rejected: [GHOST] });
  });

  it("reads a member's roles, or none when the member is gone", async () => {
    const { fetchMemberRoleIds } = await import("../../apps/dashboard/lib/server/discordMemberAccess");

    await expect(fetchMemberRoleIds(GUILD_ID, ALICE)).resolves.toEqual([ROLE_OK]);
    await expect(fetchMemberRoleIds(GUILD_ID, GHOST)).resolves.toEqual([]);
  });
});
