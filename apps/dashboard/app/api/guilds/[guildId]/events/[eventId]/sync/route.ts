import { NextResponse } from "next/server";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { syncPublishedEventMessage } from "@/lib/server/eventMessageSync";

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

  const result = await syncPublishedEventMessage(guildId, eventId);

  if (!result.ok) {
    // A failed Discord update carries the bot's sync status; earlier checks map straight to their HTTP status.
    if (result.syncStatus) {
      return responseForSyncFailure({ status: result.syncStatus, errorCode: result.errorCode ?? null, errorMessage: result.error });
    }
    return NextResponse.json({ error: result.error, errorCode: result.errorCode ?? undefined }, { status: result.status });
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
