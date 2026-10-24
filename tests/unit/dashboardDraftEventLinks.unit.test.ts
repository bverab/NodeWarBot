import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getGuildPostChannels = vi.fn();
const getGuildPostChannelById = vi.fn();
const validateBotAuthoredMessage = vi.fn();

vi.mock("@/lib/server/discordGuildConfig", () => ({ getGuildPostChannels, getGuildPostChannelById }));
vi.mock("@/lib/server/discordRestEventAdapter", () => ({ validateBotAuthoredMessage }));

const GUILD_ID = "100000000000000001";
const CHANNEL_ID = "200000000000000002";
const OTHER_CHANNEL_ID = "200000000000000009";
const MESSAGE_ID = "300000000000000003";

const channel = (id: string) => ({ id, name: "events", type: 0, position: 0, parentId: null });

const { validateDraftEventLinks } = await import("../../apps/dashboard/lib/server/draftEventLinks");

describe("validateDraftEventLinks", () => {
  beforeEach(() => {
    getGuildPostChannels.mockReset().mockResolvedValue([channel(CHANNEL_ID)]);
    getGuildPostChannelById.mockReset().mockResolvedValue(null);
    validateBotAuthoredMessage.mockReset().mockResolvedValue({ ok: true });
  });

  it("does nothing when the patch touches neither channelId nor messageId", async () => {
    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: null, patch: {} })).resolves.toEqual({ ok: true });
    expect(getGuildPostChannels).not.toHaveBeenCalled();
    expect(validateBotAuthoredMessage).not.toHaveBeenCalled();
  });

  it("accepts a new channel that belongs to the guild", async () => {
    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: null, patch: { channelId: CHANNEL_ID } })).resolves.toEqual({ ok: true });
  });

  it("falls back to a direct channel lookup for channels missing from the list", async () => {
    getGuildPostChannelById.mockResolvedValue(channel(OTHER_CHANNEL_ID));

    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: null, patch: { channelId: OTHER_CHANNEL_ID } })).resolves.toEqual({ ok: true });
    expect(getGuildPostChannelById).toHaveBeenCalledWith(GUILD_ID, OTHER_CHANNEL_ID);
  });

  it("rejects a channel that is not part of the guild", async () => {
    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: null, patch: { channelId: OTHER_CHANNEL_ID } })).resolves.toEqual({
      ok: false,
      status: 400,
      path: "channelId",
      error: "Selected channel is not available for this guild."
    });
  });

  it("does not re-validate a channel that did not change, nor a cleared channel", async () => {
    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: CHANNEL_ID, patch: { channelId: CHANNEL_ID } })).resolves.toEqual({ ok: true });
    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: CHANNEL_ID, patch: { channelId: null } })).resolves.toEqual({ ok: true });
    expect(getGuildPostChannels).not.toHaveBeenCalled();
  });

  it("requires the message to exist in the effective channel and be authored by the bot", async () => {
    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: CHANNEL_ID, patch: { messageId: MESSAGE_ID } })).resolves.toEqual({ ok: true });
    expect(validateBotAuthoredMessage).toHaveBeenCalledWith(GUILD_ID, CHANNEL_ID, MESSAGE_ID);

    await validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: OTHER_CHANNEL_ID, patch: { channelId: CHANNEL_ID, messageId: MESSAGE_ID } });
    expect(validateBotAuthoredMessage).toHaveBeenLastCalledWith(GUILD_ID, CHANNEL_ID, MESSAGE_ID);
  });

  it("surfaces the Discord check failure for the message", async () => {
    validateBotAuthoredMessage.mockResolvedValue({ ok: false, status: 400, error: "That Discord message was not sent by Spectre." });

    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: CHANNEL_ID, patch: { messageId: MESSAGE_ID } })).resolves.toEqual({
      ok: false,
      status: 400,
      path: "messageId",
      error: "That Discord message was not sent by Spectre."
    });
  });

  it("refuses to link a message when the event has no channel", async () => {
    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: null, patch: { messageId: MESSAGE_ID } })).resolves.toMatchObject({
      ok: false,
      status: 400,
      path: "messageId"
    });
    expect(validateBotAuthoredMessage).not.toHaveBeenCalled();
  });

  it("lets a draft clear its messageId without calling Discord", async () => {
    await expect(validateDraftEventLinks({ guildId: GUILD_ID, currentChannelId: CHANNEL_ID, patch: { messageId: null } })).resolves.toEqual({ ok: true });
    expect(validateBotAuthoredMessage).not.toHaveBeenCalled();
  });
});
