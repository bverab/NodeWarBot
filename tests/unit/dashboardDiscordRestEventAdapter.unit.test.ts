import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const REQUIRED_PERMISSIONS = "84992";
const GUILD_ID = "100000000000000001";
const CHANNEL_ID = "200000000000000002";
const MESSAGE_ID = "300000000000000003";
const BOT_ID = "400000000000000004";
const OTHER_USER_ID = "500000000000000005";

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
  messageAuthorId?: string;
} = {}) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    calls.push({ url, method });

    if (url.endsWith(`/channels/${CHANNEL_ID}`) && method === "GET") {
      return jsonResponse({ id: CHANNEL_ID, guild_id: GUILD_ID, type: 0, permission_overwrites: [] });
    }
    if (url.endsWith(`/guilds/${GUILD_ID}/roles`) && method === "GET") {
      return jsonResponse([{ id: GUILD_ID, permissions: options.rolePermissions ?? REQUIRED_PERMISSIONS }]);
    }
    if (url.endsWith("/users/@me") && method === "GET") {
      return jsonResponse({ id: BOT_ID });
    }
    if (url.endsWith(`/guilds/${GUILD_ID}/members/${BOT_ID}`) && method === "GET") {
      return jsonResponse({ user: { id: BOT_ID }, roles: [] });
    }
    if (url.endsWith(`/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`) && method === "GET") {
      const status = options.messageFetchStatus ?? 200;
      return status === 200
        ? jsonResponse({ id: MESSAGE_ID, channel_id: CHANNEL_ID, author: { id: options.messageAuthorId ?? BOT_ID } })
        : jsonResponse({ code: 10008, message: "Unknown Message" }, status);
    }
    if (url.endsWith(`/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`) && method === "PATCH") {
      const status = options.messagePatchStatus ?? 200;
      return status === 200
        ? jsonResponse({ id: MESSAGE_ID })
        : jsonResponse({ code: 50013, message: "Missing Permissions" }, status);
    }
    if (url.endsWith(`/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`) && method === "DELETE") {
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

    const result = await validateBotCanPublishToChannel(GUILD_ID, CHANNEL_ID);

    expect(result).toMatchObject({ ok: true, botUserId: BOT_ID });
  });

  it("rejects missing channel permissions clearly", async () => {
    vi.stubEnv("TOKEN", "bot-token");
    mockDiscordFetch({ rolePermissions: "0" });
    const { validateBotCanPublishToChannel } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

    const result = await validateBotCanPublishToChannel(GUILD_ID, CHANNEL_ID);

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

    const guild = createDiscordRestGuildAdapter(GUILD_ID);
    const channel = await guild.channels.fetch(CHANNEL_ID);
    const message = await channel.messages.fetch(MESSAGE_ID);
    const result = await message.edit({ embeds: [], components: [] });

    expect(result).toEqual({ id: MESSAGE_ID });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("surfaces Unknown Message from REST fetch", async () => {
    vi.stubEnv("TOKEN", "bot-token");
    mockDiscordFetch({ messageFetchStatus: 404 });
    const { createDiscordRestGuildAdapter } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

    const guild = createDiscordRestGuildAdapter(GUILD_ID);
    const channel = await guild.channels.fetch(CHANNEL_ID);

    await expect(channel.messages.fetch(MESSAGE_ID)).rejects.toMatchObject({
      code: 10008,
      status: 404,
      rawError: { code: 10008, message: "Unknown Message" }
    });
  });

  it("deletes a Discord message via REST without parsing a 204 body", async () => {
    vi.stubEnv("TOKEN", "bot-token");
    const { fetchMock } = mockDiscordFetch();
    const { createDiscordRestGuildAdapter } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

    const guild = createDiscordRestGuildAdapter(GUILD_ID);
    const channel = await guild.channels.fetch(CHANNEL_ID);
    const message = await channel.messages.fetch(MESSAGE_ID);
    await expect(message.delete()).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  describe("pre-validated channel", () => {
    it("does not validate the channel again when the caller already did", async () => {
      vi.stubEnv("TOKEN", "bot-token");
      const { fetchMock } = mockDiscordFetch();
      const { createDiscordRestGuildAdapter, validateBotCanPublishToChannel } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

      const check = await validateBotCanPublishToChannel(GUILD_ID, CHANNEL_ID);
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      fetchMock.mockClear();

      const guild = createDiscordRestGuildAdapter(GUILD_ID, { validatedChannel: check.channel });
      const channel = await guild.channels.fetch(CHANNEL_ID);
      const message = await channel.messages.fetch(MESSAGE_ID);
      await message.edit({ embeds: [] });

      expect(channel.id).toBe(CHANNEL_ID);
      // Only the message fetch and the edit: no channel, roles, bot user or member lookups.
      expect(fetchMock.mock.calls.map(([url]) => String(url).replace(/^.*\/api\/v10/, ""))).toEqual([
        `/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`,
        `/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`
      ]);
    });

    it("still validates a different channel", async () => {
      vi.stubEnv("TOKEN", "bot-token");
      const { fetchMock } = mockDiscordFetch();
      const { createDiscordRestGuildAdapter } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

      const guild = createDiscordRestGuildAdapter(GUILD_ID, { validatedChannel: { id: "200000000000000009", type: 0 } });
      await guild.channels.fetch(CHANNEL_ID);

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/channels/${CHANNEL_ID}`), expect.anything());
    });
  });

  describe("snowflake validation", () => {
    it("refuses to build REST paths from ids that are not snowflakes", async () => {
      vi.stubEnv("TOKEN", "bot-token");
      const { fetchMock } = mockDiscordFetch();
      const { validateBotCanPublishToChannel } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

      for (const channelId of ["channel_1", "../guilds/1/roles", `${CHANNEL_ID}/messages`, "", "123"]) {
        await expect(validateBotCanPublishToChannel(GUILD_ID, channelId)).resolves.toMatchObject({ ok: false, status: 400 });
      }
      await expect(validateBotCanPublishToChannel("guild_1", CHANNEL_ID)).resolves.toMatchObject({ ok: false, status: 400 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects channel and message ids that are not snowflakes before calling Discord", async () => {
      vi.stubEnv("TOKEN", "bot-token");
      const { fetchMock } = mockDiscordFetch();
      const { createDiscordRestGuildAdapter, deleteDiscordMessageByRest } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

      const guild = createDiscordRestGuildAdapter(GUILD_ID);
      await expect(guild.channels.fetch("../users/@me")).rejects.toMatchObject({ status: 400 });

      const channel = await guild.channels.fetch(CHANNEL_ID);
      fetchMock.mockClear();

      await expect(channel.messages.fetch("message_1")).rejects.toMatchObject({ status: 400 });
      await expect(channel.messages.fetch(`${MESSAGE_ID}/reactions`)).rejects.toMatchObject({ status: 400 });
      await expect(deleteDiscordMessageByRest("channel_1", MESSAGE_ID)).rejects.toMatchObject({ status: 400 });
      await expect(deleteDiscordMessageByRest(CHANNEL_ID, "../..")).rejects.toMatchObject({ status: 400 });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("validateBotAuthoredMessage", () => {
    it("accepts a message sent by the bot in the channel", async () => {
      vi.stubEnv("TOKEN", "bot-token");
      mockDiscordFetch();
      const { validateBotAuthoredMessage } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

      await expect(validateBotAuthoredMessage(GUILD_ID, CHANNEL_ID, MESSAGE_ID)).resolves.toEqual({ ok: true });
    });

    it("rejects a message written by someone else", async () => {
      vi.stubEnv("TOKEN", "bot-token");
      mockDiscordFetch({ messageAuthorId: OTHER_USER_ID });
      const { validateBotAuthoredMessage } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

      await expect(validateBotAuthoredMessage(GUILD_ID, CHANNEL_ID, MESSAGE_ID)).resolves.toMatchObject({
        ok: false,
        status: 400,
        error: "That Discord message was not sent by Spectre."
      });
    });

    it("reports a message that does not exist in that channel as 404", async () => {
      vi.stubEnv("TOKEN", "bot-token");
      mockDiscordFetch({ messageFetchStatus: 404 });
      const { validateBotAuthoredMessage } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

      await expect(validateBotAuthoredMessage(GUILD_ID, CHANNEL_ID, MESSAGE_ID)).resolves.toMatchObject({
        ok: false,
        status: 404,
        error: "Discord message was not found in that channel."
      });
    });

    it("does not call Discord for invalid ids", async () => {
      vi.stubEnv("TOKEN", "bot-token");
      const { fetchMock } = mockDiscordFetch();
      const { validateBotAuthoredMessage } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

      await expect(validateBotAuthoredMessage(GUILD_ID, CHANNEL_ID, "message_1")).resolves.toMatchObject({ ok: false, status: 400 });
      await expect(validateBotAuthoredMessage(GUILD_ID, "channel_1", MESSAGE_ID)).resolves.toMatchObject({ ok: false, status: 400 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("propagates channel permission failures", async () => {
      vi.stubEnv("TOKEN", "bot-token");
      mockDiscordFetch({ rolePermissions: "0" });
      const { validateBotAuthoredMessage } = await import("../../apps/dashboard/lib/server/discordRestEventAdapter");

      await expect(validateBotAuthoredMessage(GUILD_ID, CHANNEL_ID, MESSAGE_ID)).resolves.toMatchObject({ ok: false, status: 403 });
    });
  });
});
