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

type PveAccessEvent = {
  id: string;
  eventType: string;
  accessMode: string;
  allowedUserIds: string[];
  allowedRoleIds: string[];
};

export type PromotedPveFiller = { userId: string; displayName: string; isFake: boolean; optionId: string; optionLabel: string };

const pveService = requireNodeWarBot("../../../../src/services/pveService.js") as {
  promoteQualifiedFillers(
    event: PveAccessEvent,
    options: { resolveMemberRoleIds?: (userId: string) => Promise<string[]> }
  ): Promise<PromotedPveFiller[]>;
};

export const publishEventToDiscord = discordEventSyncService.publishEventToDiscord;
export const updateEventDiscordMessage = discordEventSyncService.updateEventDiscordMessage;
export const deleteEventDiscordMessage = discordEventSyncService.deleteEventDiscordMessage;
// After a PvE access change: fillers who now qualify move up while their option has room (the bot's own rule).
export const promoteQualifiedFillers = pveService.promoteQualifiedFillers;
