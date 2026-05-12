import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const REQUIRED_PERMISSIONS = "84992";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

function mockDiscordFetch(options: {
  rolePermissions?: string;
  messageFetchStatus?: number;
  messagePatchStatus?: number;
  messageDeleteStatus?: number;
} = {}) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    calls.push({ url, method });

    if (url.endsWith("/channels/channel_1") && method === "GET") {
      return jsonResponse({ id: "channel_1", guild_id: "guild_1", type: 0, permission_overwrites: [] });
    }
    if (url.endsWith("/guilds/guild_1/roles") && method === "GET") {
      return jsonResponse([{ id: "guild_1", permissions: options.rolePermissions ?? REQUIRED_PERMISSIONS }]);
    }
    if (url.endsWith("/users/@me") && method === "GET") {
      return jsonResponse({ id: "bot_1" });
    }
    if (url.endsWith("/guilds/guild_1/members/bot_1") && method === "GET") {
      return jsonResponse({ user: { id: "bot_1" }, roles: [] });
    }
    if (url.endsWith("/channels/channel_1/messages/message_1") && method === "GET") {
      const status = options.messageFetchStatus ?? 200;
      return status === 200
        ? jsonResponse({ id: "message_1" })
        : jsonResponse({ code: 10008, message: "Unknown Message" }, status);
    }
    if (url.endsWith("/channels/channel_1/messages/message_1") && method === "PATCH") {
      const status = options.messagePatchStatus ?? 200;
      return status === 200
        ? jsonResponse({ id: "message_1" })
        : jsonResponse({ code: 50013, message: "Missing Permissions" }, status);
    }
    if (url.endsWith("/channels/channel_1/messages/message_1") && method === "DELETE") {
      const status = options.messageDeleteStatus ?? 204;
      return status === 204
        ? jsonResponse({}, 204)
        : jsonResponse({ code: 10008, message: "Unknown Message" }, status);
    }

    return jsonResponse({ message: `Unhandled ${method} ${url}` }, 500);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

describe("dashboard Discord REST event adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("validates bot permissions for a publishable channel", async () => {
    vi.stubEnv("TOKEN", "bot-token");
    mockDiscordFetch();
    const { validateBotCanPublishToChannel } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

    const result = await validateBotCanPublishToChannel("guild_1", "channel_1");

    expect(result).toMatchObject({ ok: true });
  });

  it("rejects missing channel permissions clearly", async () => {
    vi.stubEnv("TOKEN", "bot-token");
    mockDiscordFetch({ rolePermissions: "0" });
    const { validateBotCanPublishToChannel } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

    const result = await validateBotCanPublishToChannel("guild_1", "channel_1");

    expect(result).toMatchObject({
      ok: false,
      status: 403,
      error: "Spectre does not have View Channel, Send Messages, Embed Links, and Read Message History in that channel."
    });
  });

  it("provides a Discord-like message edit adapter over REST", async () => {
    vi.stubEnv("TOKEN", "bot-token");
    const { fetchMock } = mockDiscordFetch();
    const { createDiscordRestGuildAdapter } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

    const guild = createDiscordRestGuildAdapter("guild_1");
    const channel = await guild.channels.fetch("channel_1");
    const message = await channel.messages.fetch("message_1");
    const result = await message.edit({ embeds: [], components: [] });

    expect(result).toEqual({ id: "message_1" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/channels/channel_1/messages/message_1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("surfaces Unknown Message from REST fetch", async () => {
    vi.stubEnv("TOKEN", "bot-token");
    mockDiscordFetch({ messageFetchStatus: 404 });
    const { createDiscordRestGuildAdapter } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

    const guild = createDiscordRestGuildAdapter("guild_1");
    const channel = await guild.channels.fetch("channel_1");

    await expect(channel.messages.fetch("message_1")).rejects.toMatchObject({
      code: 10008,
      status: 404,
      rawError: { code: 10008, message: "Unknown Message" }
    });
  });

  it("deletes a Discord message via REST without parsing a 204 body", async () => {
    vi.stubEnv("TOKEN", "bot-token");
    const { fetchMock } = mockDiscordFetch();
    const { createDiscordRestGuildAdapter } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

    const guild = createDiscordRestGuildAdapter("guild_1");
    const channel = await guild.channels.fetch("channel_1");
    const message = await channel.messages.fetch("message_1");
    await expect(message.delete()).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/channels/channel_1/messages/message_1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
