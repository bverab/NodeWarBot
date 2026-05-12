import "server-only";
import { createRequire } from "node:module";

const requireNodeWarBot = createRequire(import.meta.url);

type PublishResult = {
  ok: boolean;
  status: string;
  messageId: string | null;
  channelId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type PublishArgs = {
  guild: unknown;
  client?: unknown;
  event: unknown;
  channelId?: string | null;
  messageOptions?: Record<string, unknown>;
};

const discordEventSyncService = requireNodeWarBot("../../../../src/services/discordEventSyncService.js") as {
  publishEventToDiscord(args: PublishArgs): Promise<PublishResult>;
  updateEventDiscordMessage(args: PublishArgs): Promise<PublishResult>;
  deleteEventDiscordMessage(args: PublishArgs): Promise<PublishResult>;
};

export const publishEventToDiscord = discordEventSyncService.publishEventToDiscord;
export const updateEventDiscordMessage = discordEventSyncService.updateEventDiscordMessage;
export const deleteEventDiscordMessage = discordEventSyncService.deleteEventDiscordMessage;
