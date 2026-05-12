import { NextResponse } from "next/server";
import { mapDbEventToDiscordDomain } from "@/lib/server/eventDomainMapper";
import { prisma } from "@/lib/server/prisma";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { createDiscordRestGuildAdapter, deleteDiscordMessageByRest, validateBotCanPublishToChannel } from "@/lib/server/discordRestEventAdapter";
import { publishEventToDiscord } from "@/lib/server/nodeWarBotServices";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string }>;
};

function buildPublishContent(event: {
  eventType: string;
  accessMode: string;
  notifyTargets: Array<{ targetId: string }>;
  accessUsers: Array<{ userId: string }>;
}) {
  const isRestrictedPve = event.eventType === "pve" && event.accessMode.toUpperCase() === "RESTRICTED";
  const targets = isRestrictedPve
    ? Array.from(new Set(event.accessUsers.map((user) => user.userId).filter(Boolean)))
    : Array.from(new Set(event.notifyTargets.map((target) => target.targetId).filter(Boolean)));

  if (!targets.length) {
    return {
      content: "Evento publicado desde dashboard",
      allowedMentions: { parse: [] }
    };
  }

  return isRestrictedPve
    ? {
        content: targets.map((userId) => `<@${userId}>`).join(" "),
        allowedMentions: { parse: [], users: targets }
      }
    : {
        content: targets.map((roleId) => `<@&${roleId}>`).join(" "),
        allowedMentions: { parse: [], roles: targets }
      };
}

export async function POST(_request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

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
    return NextResponse.json({ error: "Event not found for this guild." }, { status: 404 });
  }

  if (event.messageId) {
    return NextResponse.json({ error: "Event is already published to Discord." }, { status: 409 });
  }

  if (!event.channelId) {
    return NextResponse.json({ error: "Select a Discord channel before publishing this event." }, { status: 400 });
  }

  const permissionCheck = await validateBotCanPublishToChannel(guildId, event.channelId);
  if (!permissionCheck.ok) {
    return NextResponse.json({ error: permissionCheck.error, errorCode: permissionCheck.errorCode }, { status: permissionCheck.status });
  }

  const domainEvent = mapDbEventToDiscordDomain(event);
  const mentions = buildPublishContent(event);
  const publishResult = await publishEventToDiscord({
    guild: createDiscordRestGuildAdapter(guildId),
    event: domainEvent,
    channelId: event.channelId,
    messageOptions: mentions
  });

  if (!publishResult.ok || !publishResult.messageId) {
    return NextResponse.json(
      {
        error: publishResult.errorMessage || "Discord publish failed.",
        errorCode: publishResult.errorCode,
        status: publishResult.status
      },
      { status: publishResult.status === "missing_permissions" ? 403 : publishResult.status === "missing_channel" ? 404 : 502 }
    );
  }

  try {
    const updated = await prisma.event.updateMany({
      where: { id: event.id, guildId, messageId: null },
      data: {
        channelId: event.channelId,
        messageId: publishResult.messageId
      }
    });

    if (updated.count !== 1) {
      await deleteDiscordMessageByRest(event.channelId, publishResult.messageId).catch((error) => {
        console.error("Failed to compensate duplicate dashboard publish.", error);
      });
      return NextResponse.json({ error: "Event was already published by another request." }, { status: 409 });
    }
  } catch (error) {
    await deleteDiscordMessageByRest(event.channelId, publishResult.messageId).catch((deleteError) => {
      console.error("Failed to delete Discord message after Prisma publish update failed.", deleteError);
    });
    console.error("Discord message was published but Prisma update failed.", error);
    return NextResponse.json(
      { error: "Discord message was published, but saving the message ID failed. Check logs before retrying." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: "published",
      messageId: publishResult.messageId,
      channelId: event.channelId
    },
    { status: 200 }
  );
}
