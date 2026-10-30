import "server-only";
import type { EventMutationInput } from "@/lib/server/dashboardData";
import { getGuildPostChannelById, getGuildPostChannels } from "@/lib/server/discordGuildConfig";
import { validateBotAuthoredMessage } from "@/lib/server/discordRestEventAdapter";

export type DraftEventLinkValidation =
  | { ok: true }
  | { ok: false; status: number; path: "channelId" | "messageId"; error: string };

type ValidateDraftEventLinksInput = {
  guildId: string;
  currentChannelId: string | null;
  patch: Pick<EventMutationInput, "channelId" | "messageId">;
};

// A draft may point at a channel and (intentionally) at an existing Discord message. Both come from the client,
// so they are checked against Discord before being stored: the channel must belong to the guild and the message
// must exist in that channel and have been sent by the bot.
export async function validateDraftEventLinks({ guildId, currentChannelId, patch }: ValidateDraftEventLinksInput): Promise<DraftEventLinkValidation> {
  // The edit form re-sends the stored channel on every save; only a changed channel needs to be checked again.
  if (typeof patch.channelId === "string" && patch.channelId !== currentChannelId) {
    const channels = await getGuildPostChannels(guildId);
    if (!channels.some((channel) => channel.id === patch.channelId)) {
      const manualChannel = await getGuildPostChannelById(guildId, patch.channelId);
      if (!manualChannel) {
        return { ok: false, status: 400, path: "channelId", error: "Selected channel is not available for this guild." };
      }
    }
  }

  if (typeof patch.messageId === "string") {
    const channelId = patch.channelId !== undefined ? patch.channelId : currentChannelId;
    if (!channelId) {
      return { ok: false, status: 400, path: "messageId", error: "Select a Discord channel before linking a Discord message." };
    }

    const messageCheck = await validateBotAuthoredMessage(guildId, channelId, patch.messageId);
    if (!messageCheck.ok) {
      return { ok: false, status: messageCheck.status, path: "messageId", error: messageCheck.error };
    }
  }

  return { ok: true };
}
