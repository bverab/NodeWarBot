import "server-only";
import { mapDbEventToDiscordDomain } from "@/lib/server/eventDomainMapper";
import { prisma } from "@/lib/server/prisma";
import { createDiscordRestGuildAdapter, validateBotCanPublishToChannel } from "@/lib/server/discordRestEventAdapter";
import { updateEventDiscordMessage } from "@/lib/server/nodeWarBotServices";

export type EventMessageSyncResult =
  | { ok: true; messageId: string | null; channelId: string | null }
  | { ok: false; status: number; error: string; errorCode?: string | null; syncStatus?: string };

// Re-renders the Discord message of a published event from what is stored now.
export async function syncPublishedEventMessage(guildId: string, eventId: string): Promise<EventMessageSyncResult> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, guildId },
    include: {
      roleSlots: {
        orderBy: { position: "asc" },
        include: {
          users: { orderBy: { joinedAt: "asc" } },
          permissions: true
        }
      },
      options: {
        orderBy: { position: "asc" },
        include: {
          enrollments: { orderBy: { joinedAt: "asc" } }
        }
      },
      enrollments: { orderBy: { joinedAt: "asc" } },
      waitlist: { orderBy: { position: "asc" } },
      notifyTargets: { orderBy: { position: "asc" } },
      accessUsers: { orderBy: { position: "asc" } },
      accessRoles: { orderBy: { position: "asc" } },
      fillers: { orderBy: { joinedAt: "asc" } },
      schedule: true,
      recap: true
    }
  });

  if (!event) {
    return { ok: false, status: 404, error: "Event not found for this guild." };
  }

  if (!event.messageId) {
    return { ok: false, status: 409, error: "Event is not published to Discord yet." };
  }

  if (!event.channelId) {
    return { ok: false, status: 400, error: "Published event is missing its Discord channel ID." };
  }

  const permissionCheck = await validateBotCanPublishToChannel(guildId, event.channelId);
  if (!permissionCheck.ok) {
    return { ok: false, status: permissionCheck.status, error: permissionCheck.error, errorCode: permissionCheck.errorCode };
  }

  const result = await updateEventDiscordMessage({
    guild: createDiscordRestGuildAdapter(guildId, { validatedChannel: permissionCheck.channel }),
    event: mapDbEventToDiscordDomain(event)
  });

  if (!result.ok) {
    return { ok: false, status: 502, error: result.errorMessage || "Discord message sync failed.", errorCode: result.errorCode, syncStatus: result.status };
  }

  return { ok: true, messageId: result.messageId, channelId: result.channelId };
}
