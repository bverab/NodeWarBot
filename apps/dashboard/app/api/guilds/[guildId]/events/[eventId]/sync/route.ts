import { NextResponse } from "next/server";
import { mapDbEventToDiscordDomain } from "@/lib/server/eventDomainMapper";
import { prisma } from "@/lib/server/prisma";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { createDiscordRestGuildAdapter, validateBotCanPublishToChannel } from "@/lib/server/discordRestEventAdapter";
import { updateEventDiscordMessage } from "@/lib/server/nodeWarBotServices";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string }>;
};

function responseForSyncFailure(result: {
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
}) {
  if (result.status === "missing_message" || result.errorCode === "10008") {
    return NextResponse.json(
      {
        error: "Discord message could not be found. You may need to republish the event.",
        errorCode: result.errorCode
      },
      { status: 404 }
    );
  }

  if (result.status === "missing_channel" || result.errorCode === "10003") {
    return NextResponse.json(
      { error: "Discord channel could not be found.", errorCode: result.errorCode },
      { status: 404 }
    );
  }

  if (result.status === "missing_access" || result.errorCode === "50001") {
    return NextResponse.json(
      { error: "Spectre cannot access that Discord channel.", errorCode: result.errorCode },
      { status: 403 }
    );
  }

  if (result.status === "missing_permissions" || result.errorCode === "50013") {
    return NextResponse.json(
      { error: "Spectre does not have permission to update that Discord message.", errorCode: result.errorCode },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { error: result.errorMessage || "Discord message sync failed.", errorCode: result.errorCode },
    { status: 502 }
  );
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
    return NextResponse.json({ error: "Event not found for this guild." }, { status: 404 });
  }

  if (!event.messageId) {
    return NextResponse.json({ error: "Event is not published to Discord yet." }, { status: 409 });
  }

  if (!event.channelId) {
    return NextResponse.json({ error: "Published event is missing its Discord channel ID." }, { status: 400 });
  }

  const permissionCheck = await validateBotCanPublishToChannel(guildId, event.channelId);
  if (!permissionCheck.ok) {
    return NextResponse.json({ error: permissionCheck.error, errorCode: permissionCheck.errorCode }, { status: permissionCheck.status });
  }

  const result = await updateEventDiscordMessage({
    guild: createDiscordRestGuildAdapter(guildId),
    event: mapDbEventToDiscordDomain(event)
  });

  if (!result.ok) {
    return responseForSyncFailure(result);
  }

  return NextResponse.json(
    {
      ok: true,
      status: "synced",
      messageId: result.messageId,
      channelId: result.channelId
    },
    { status: 200 }
  );
}
