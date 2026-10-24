import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));

const requireDashboardGuild = vi.fn();
const requireManageableDashboardGuild = vi.fn();
const createGuildEventDraft = vi.fn();
const getGuildEvents = vi.fn();
const getGuildRoles = vi.fn();
const getGuildPostChannels = vi.fn();
const getGuildPostChannelById = vi.fn();

vi.mock("@/lib/apiGuards", async () => await vi.importActual("../../apps/dashboard/lib/apiGuards"));
vi.mock("@/lib/eventDateTime", async () => await vi.importActual("../../apps/dashboard/lib/eventDateTime"));
vi.mock("@/lib/server/createEventValidation", async () => await vi.importActual("../../apps/dashboard/lib/server/createEventValidation"));
vi.mock("@/lib/server/dashboardGuildVerificationCookie", async () => await vi.importActual("../../apps/dashboard/lib/server/dashboardGuildVerificationCookie"));
vi.mock("@/lib/server/guildAccess", () => ({ requireDashboardGuild, requireManageableDashboardGuild }));
vi.mock("@/lib/server/dashboardData", () => ({ createGuildEventDraft, getGuildEvents }));
vi.mock("@/lib/server/discordGuildConfig", () => ({ getGuildRoles, getGuildPostChannels, getGuildPostChannelById }));

const GUILD_ID = "100000000000000001";
const guilds = [{ id: GUILD_ID, name: "Node War", icon: null, owner: false, manageable: true }];

const { POST } = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/route");

function createRequest() {
  return POST(
    new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Node War",
        eventType: "war",
        type: "Node War",
        date: "2030-05-05",
        time: "20:00",
        timezone: "America/Santiago",
        duration: 60,
        closeBeforeMinutes: 10,
        slots: [{ name: "Flex", max: 5 }]
      })
    }),
    { params: Promise.resolve({ guildId: GUILD_ID }) }
  );
}

function access(overrides: Record<string, unknown>) {
  return {
    activeGuild: guilds[0],
    availableGuilds: guilds,
    session: { accessToken: "token", user: { id: "user_1" }, expires: "2099-01-01" },
    guildSource: "discord",
    guildsStale: false,
    ...overrides
  };
}

describe("POST /api/guilds/[guildId]/events verified guilds cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_SECRET", "unit-test-secret");
    getGuildRoles.mockResolvedValue([]);
    getGuildPostChannels.mockResolvedValue([]);
    getGuildPostChannelById.mockResolvedValue(null);
    createGuildEventDraft.mockResolvedValue({ id: "event_1" });
  });

  it("signs the cookie, bound to the user, when the guilds were just verified with Discord", async () => {
    requireManageableDashboardGuild.mockResolvedValue(access({ guildSource: "discord" }));

    const response = await createRequest();

    expect(response.status).toBe(201);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("spectre_verified_guilds=");

    const value = decodeURIComponent(setCookie.split(";")[0].split("=").slice(1).join("="));
    const payload = JSON.parse(Buffer.from(value.split(".")[0], "base64url").toString("utf8"));
    expect(payload.userId).toBe("user_1");
  });

  it("does not re-sign the cookie from data that came out of the cookie itself", async () => {
    requireManageableDashboardGuild.mockResolvedValue(access({ guildSource: "cookie" }));

    const response = await createRequest();

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not sign stale guild data", async () => {
    requireManageableDashboardGuild.mockResolvedValue(access({ guildSource: "discord", guildsStale: true }));

    const response = await createRequest();

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
