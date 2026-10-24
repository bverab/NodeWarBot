import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const readVerifiedGuildsCookie = vi.fn();
const getDashboardGuildsDetailed = vi.fn();

vi.mock("@/lib/server/dashboardGuildVerificationCookie", () => ({ readVerifiedGuildsCookie }));
vi.mock("@/lib/dashboardGuilds", () => ({
  getDashboardGuildsDetailed,
  findActiveGuild: (guilds: Array<{ id: string }>, guildId: string) => guilds.find((guild) => guild.id === guildId) ?? null
}));

const guild = { id: "100000000000000001", name: "Node War", icon: null, owner: false, manageable: true };
const session = { accessToken: "token", user: { id: "user_1" }, expires: "2099-01-01" };

const { getDashboardGuildsForServer, resolveDashboardGuildForServer } = await import("../../apps/dashboard/lib/server/dashboardGuildResolution");

describe("dashboard guild resolution source", () => {
  beforeEach(() => {
    readVerifiedGuildsCookie.mockReset().mockResolvedValue([]);
    getDashboardGuildsDetailed.mockReset();
  });

  it("looks the cookie up for the signed-in user only", async () => {
    getDashboardGuildsDetailed.mockResolvedValue({ guilds: [guild], stale: false, error: null });

    await getDashboardGuildsForServer(session);

    expect(readVerifiedGuildsCookie).toHaveBeenCalledWith("user_1");
  });

  it("marks guilds that come from the cookie so they are never re-signed", async () => {
    readVerifiedGuildsCookie.mockResolvedValue([guild]);

    const result = await getDashboardGuildsForServer(session);

    expect(result).toMatchObject({ source: "cookie", stale: false, guilds: [guild] });
    expect(getDashboardGuildsDetailed).not.toHaveBeenCalled();
  });

  it("marks guilds verified with Discord as such", async () => {
    getDashboardGuildsDetailed.mockResolvedValue({ guilds: [guild], stale: false, error: null });

    const result = await getDashboardGuildsForServer(session);

    expect(result).toMatchObject({ source: "discord", stale: false, guilds: [guild] });
  });

  it("falls back to the cookie when Discord fails and flags the result as stale cookie data", async () => {
    readVerifiedGuildsCookie.mockResolvedValue([guild]);
    getDashboardGuildsDetailed.mockResolvedValue({ guilds: [], stale: false, error: { code: "rate_limited", message: "x", status: 429 } });

    const result = await getDashboardGuildsForServer(session, { preferCookie: false });

    expect(result).toMatchObject({ source: "cookie", stale: true, guilds: [guild] });
  });

  it("exposes the source through resolveDashboardGuildForServer", async () => {
    readVerifiedGuildsCookie.mockResolvedValue([guild]);

    const result = await resolveDashboardGuildForServer(session, guild.id);

    expect(result).toMatchObject({ source: "cookie", activeGuild: guild });
  });
});
