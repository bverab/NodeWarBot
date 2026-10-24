import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getServerAuthSession = vi.fn();
const resolveDashboardGuildForServer = vi.fn();

vi.mock("@/lib/auth", () => ({ getServerAuthSession }));
vi.mock("@/lib/server/dashboardGuildResolution", () => ({ resolveDashboardGuildForServer }));

const GUILD_ID = "100000000000000001";
const guild = { id: GUILD_ID, name: "Node War", icon: null, owner: false, manageable: true };

const { requireDashboardGuild, requireManageableDashboardGuild } = await import("../../apps/dashboard/lib/server/guildAccess");

function resolved(overrides: Record<string, unknown> = {}) {
  return { guilds: [guild], stale: false, error: null, source: "discord", activeGuild: guild, ...overrides };
}

describe("dashboard guild guards and the sign-in provider", () => {
  beforeEach(() => {
    getServerAuthSession.mockReset();
    resolveDashboardGuildForServer.mockReset().mockResolvedValue(resolved());
  });

  it("rejects Google sessions with 401 before touching Discord", async () => {
    getServerAuthSession.mockResolvedValue({ accessToken: "google-token", provider: "google", user: { id: "google-sub" } });

    const access = await requireDashboardGuild(GUILD_ID);

    expect("error" in access && access.error.status).toBe(401);
    expect(resolveDashboardGuildForServer).not.toHaveBeenCalled();

    const manageable = await requireManageableDashboardGuild(GUILD_ID);
    expect("error" in manageable && manageable.error.status).toBe(401);
  });

  it("keeps accepting Discord sessions", async () => {
    getServerAuthSession.mockResolvedValue({ accessToken: "discord-token", provider: "discord", user: { id: "discord-id" } });

    const access = await requireDashboardGuild(GUILD_ID);

    expect("error" in access).toBe(false);
    expect(resolveDashboardGuildForServer).toHaveBeenCalledTimes(1);
  });

  it("keeps accepting sessions issued before the provider was stored in the token", async () => {
    getServerAuthSession.mockResolvedValue({ accessToken: "discord-token", user: { id: "discord-id" } });

    const access = await requireManageableDashboardGuild(GUILD_ID);

    expect("error" in access).toBe(false);
    expect(resolveDashboardGuildForServer).toHaveBeenCalledTimes(1);
  });

  it("still answers 401 without a session or access token and 403 for non-manageable guilds", async () => {
    getServerAuthSession.mockResolvedValue(null);
    const anonymous = await requireDashboardGuild(GUILD_ID);
    expect("error" in anonymous && anonymous.error.status).toBe(401);

    getServerAuthSession.mockResolvedValue({ user: { id: "discord-id" } });
    const noToken = await requireDashboardGuild(GUILD_ID);
    expect("error" in noToken && noToken.error.status).toBe(401);

    getServerAuthSession.mockResolvedValue({ accessToken: "discord-token", user: { id: "discord-id" } });
    resolveDashboardGuildForServer.mockResolvedValue(resolved({ activeGuild: { ...guild, manageable: false } }));
    const readOnly = await requireManageableDashboardGuild(GUILD_ID);
    expect("error" in readOnly && readOnly.error.status).toBe(403);
  });

  it("exposes where the verified guilds came from", async () => {
    getServerAuthSession.mockResolvedValue({ accessToken: "discord-token", user: { id: "discord-id" } });
    resolveDashboardGuildForServer.mockResolvedValue(resolved({ source: "cookie", stale: true }));

    const access = await requireDashboardGuild(GUILD_ID);

    expect(access).toMatchObject({ guildSource: "cookie", guildsStale: true });
  });
});
