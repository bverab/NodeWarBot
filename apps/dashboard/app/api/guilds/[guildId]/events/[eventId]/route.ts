import { NextResponse } from "next/server";
import { getGuildEventDetail, updateGuildEvent } from "@/lib/server/dashboardData";
import { requireDashboardGuild, requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { parseEventPatch } from "@/lib/server/mutationValidation";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const event = await getGuildEventDetail(guildId, eventId);

    if (!event) {
      return NextResponse.json({ error: "Event not found for this guild." }, { status: 404 });
    }

    return NextResponse.json({ guild: access.activeGuild, event }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to load event details." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = parseEventPatch(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const { patch } = result;

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No supported fields were provided." }, { status: 400 });
    }

    const event = await updateGuildEvent(guildId, eventId, patch);
    if (!event) {
      return NextResponse.json({ error: "Event not found for this guild." }, { status: 404 });
    }

    return NextResponse.json({ event, sync: "discord_sync_pending" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to update event." }, { status: 500 });
  }
}
