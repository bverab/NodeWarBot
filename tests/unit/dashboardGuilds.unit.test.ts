import { afterEach, describe, expect, it, vi } from "vitest";

const fetchAvailableDashboardGuilds = vi.fn();

vi.mock("@/lib/discord", () => ({
  DiscordGuildFetchError: class DiscordGuildFetchError extends Error {
    code: string;
    retryAfterMs: number | null;
    status: number | null;

    constructor(code: string, message: string, status: number | null = null, retryAfterMs: number | null = null) {
      super(message);
      this.name = "DiscordGuildFetchError";
      this.code = code;
      this.retryAfterMs = retryAfterMs;
      this.status = status;
    }
  },
  fetchAvailableDashboardGuilds
}));

const session = {
  accessToken: "access-token",
  user: { id: "user_1", email: "user@example.com" }
};

describe("dashboard guild resolution", () => {
  afterEach(async () => {
    const { clearDashboardGuildCache } = await import("../../apps/dashboard/lib/dashboardGuilds");
    clearDashboardGuildCache();
    fetchAvailableDashboardGuilds.mockReset();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns intersected guilds from Discord", async () => {
    fetchAvailableDashboardGuilds.mockResolvedValueOnce([
      { id: "guild_1", name: "Node War", icon: null, owner: true, permissions: "8", manageable: true }
    ]);
    const { getDashboardGuildsDetailed } = await import("../../apps/dashboard/lib/dashboardGuilds");

    const result = await getDashboardGuildsDetailed(session);

    expect(result).toMatchObject({
      stale: false,
      error: null,
      guilds: [{ id: "guild_1", name: "Node War", manageable: true }]
    });
  });

  it("uses a recent successful guild list without calling Discord again", async () => {
    fetchAvailableDashboardGuilds
      .mockResolvedValueOnce([{ id: "guild_1", name: "Node War", icon: null, owner: true, permissions: "8", manageable: true }])
      .mockRejectedValueOnce(new Error("Discord unavailable"));
    const { getDashboardGuildsDetailed } = await import("../../apps/dashboard/lib/dashboardGuilds");

    await getDashboardGuildsDetailed(session);
    const result = await getDashboardGuildsDetailed(session);

    expect(result.stale).toBe(false);
    expect(result.error).toBeNull();
    expect(result.guilds.map((guild) => guild.id)).toEqual(["guild_1"]);
    expect(fetchAvailableDashboardGuilds).toHaveBeenCalledTimes(1);
  });

  it("deduplicates in-flight Discord guild lookups per session", async () => {
    fetchAvailableDashboardGuilds.mockResolvedValueOnce([
      { id: "guild_1", name: "Node War", icon: null, owner: true, permissions: "8", manageable: true }
    ]);
    const { getDashboardGuildsDetailed } = await import("../../apps/dashboard/lib/dashboardGuilds");

    const [left, right] = await Promise.all([getDashboardGuildsDetailed(session), getDashboardGuildsDetailed(session)]);

    expect(fetchAvailableDashboardGuilds).toHaveBeenCalledTimes(1);
    expect(left.guilds.map((guild) => guild.id)).toEqual(["guild_1"]);
    expect(right.guilds.map((guild) => guild.id)).toEqual(["guild_1"]);
  });

  it("honors a rate limit cooldown instead of retrying Discord immediately", async () => {
    const { DiscordGuildFetchError } = await import("@/lib/discord");
    fetchAvailableDashboardGuilds.mockRejectedValueOnce(
      new DiscordGuildFetchError("rate_limited", "Discord user guild API request was rate limited.", 429, 288000)
    );
    const { getDashboardGuildsDetailed } = await import("../../apps/dashboard/lib/dashboardGuilds");

    const first = await getDashboardGuildsDetailed(session);
    const second = await getDashboardGuildsDetailed(session);

    expect(fetchAvailableDashboardGuilds).toHaveBeenCalledTimes(1);
    expect(first.error).toMatchObject({ code: "rate_limited", retryAfterMs: 288000, status: 429 });
    expect(second.error).toMatchObject({ code: "rate_limited", retryAfterMs: 288000, status: 429 });
  });


  it("returns a clear missing token error without throwing", async () => {
    const { getDashboardGuildsDetailed } = await import("../../apps/dashboard/lib/dashboardGuilds");

    const result = await getDashboardGuildsDetailed(null);

    expect(result).toMatchObject({
      guilds: [],
      stale: false,
      error: { code: "missing_access_token", status: 401 }
    });
  });
});
