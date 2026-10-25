import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getServerAuthSession = vi.fn();
const resolveDashboardGuildForServer = vi.fn();
const isLocalAdminSession = vi.fn();
const fetchBotDashboardGuilds = vi.fn();

vi.mock("@/lib/auth", () => ({ getServerAuthSession }));
vi.mock("@/lib/server/dashboardGuildResolution", () => ({ resolveDashboardGuildForServer }));
vi.mock("@/lib/server/localAdmin", () => ({ isLocalAdminSession }));
vi.mock("@/lib/discord", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../apps/dashboard/lib/discord");
  return { ...actual, fetchBotDashboardGuilds };
});

const GUILD_ID = "100000000000000001";
const guild = { id: GUILD_ID, name: "Node War", icon: null, owner: false, manageable: true };
const localAdminSession = { provider: "local-admin", user: { id: "local-admin", name: "admin" }, expires: "" };

const { requireDashboardGuild, requireManageableDashboardGuild } = await import("../../apps/dashboard/lib/server/guildAccess");
const { getDashboardGuildsForSession } = await import("../../apps/dashboard/lib/server/dashboardGuildsForSession");

describe("local admin guild access", () => {
  beforeEach(() => {
    getServerAuthSession.mockReset();
    isLocalAdminSession.mockReset().mockReturnValue(false);
    fetchBotDashboardGuilds.mockReset();
    resolveDashboardGuildForServer
      .mockReset()
      .mockResolvedValue({ guilds: [guild], stale: false, error: null, source: "discord", activeGuild: guild });
  });

  it("lets an enabled local-admin session through the guild guards without a Discord token", async () => {
    getServerAuthSession.mockResolvedValue(localAdminSession);
    isLocalAdminSession.mockReturnValue(true);

    const access = await requireManageableDashboardGuild(GUILD_ID);

    expect("error" in access).toBe(false);
    expect(resolveDashboardGuildForServer).toHaveBeenCalledTimes(1);
  });

  it("rejects a local-admin session once the local admin is disabled", async () => {
    getServerAuthSession.mockResolvedValue(localAdminSession);
    isLocalAdminSession.mockReturnValue(false);

    const access = await requireDashboardGuild(GUILD_ID);

    expect("error" in access && access.error.status).toBe(401);
    expect(resolveDashboardGuildForServer).not.toHaveBeenCalled();
  });

  it("gives the local admin every guild the bot is in, as manageable", async () => {
    isLocalAdminSession.mockReturnValue(true);
    fetchBotDashboardGuilds.mockResolvedValue([guild, { ...guild, id: "100000000000000002", name: "Siege" }]);

    const result = await getDashboardGuildsForSession(localAdminSession);

    expect(result.error).toBeNull();
    expect(result.guilds.map((entry) => entry.id)).toEqual([GUILD_ID, "100000000000000002"]);
    expect(result.guilds.every((entry) => entry.manageable)).toBe(true);
  });
});
