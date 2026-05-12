import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { createDiscordRestGuildAdapter, validateBotCanPublishToChannel } from "@/lib/server/discordRestEventAdapter";
import { deleteEventDiscordMessage } from "@/lib/server/nodeWarBotServices";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, guildId },
    select: {
      id: true,
      guildId: true,
      channelId: true,
      messageId: true
    }
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found for this guild." }, { status: 404 });
  }

  if (!event.messageId) {
    return NextResponse.json({ error: "Event is not published to Discord." }, { status: 409 });
  }

  if (!event.channelId) {
    return NextResponse.json({ error: "Published event is missing its Discord channel ID." }, { status: 400 });
  }

  const permissionCheck = await validateBotCanPublishToChannel(guildId, event.channelId);
  if (!permissionCheck.ok) {
    return NextResponse.json({ error: permissionCheck.error, errorCode: permissionCheck.errorCode }, { status: permissionCheck.status });
  }

  const deleteResult = await deleteEventDiscordMessage({
    guild: createDiscordRestGuildAdapter(guildId),
    event
  });
  const recoverableMissingMessage = deleteResult.status === "missing_message" || deleteResult.errorCode === "10008";

  if (!deleteResult.ok && !recoverableMissingMessage) {
    const status =
      deleteResult.status === "missing_permissions" || deleteResult.errorCode === "50013"
        ? 403
        : deleteResult.status === "missing_access" || deleteResult.errorCode === "50001"
          ? 403
          : deleteResult.status === "missing_channel" || deleteResult.errorCode === "10003"
            ? 404
            : 502;

    return NextResponse.json(
      {
        error: deleteResult.errorMessage || "Discord message could not be deleted.",
        errorCode: deleteResult.errorCode
      },
      { status }
    );
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { messageId: null }
  });

  return NextResponse.json(
    {
      ok: true,
      status: recoverableMissingMessage ? "message_already_missing" : "unpublished",
      messageId: null,
      channelId: event.channelId
    },
    { status: 200 }
  );
}
