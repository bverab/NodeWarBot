import { NextResponse } from "next/server";
import { deleteGuildEventRoleSlot, updateGuildEventRoleSlot } from "@/lib/server/dashboardData";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { parseRoleSlotPatch } from "@/lib/server/mutationValidation";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string; slotId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { guildId, eventId, slotId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = parseRoleSlotPatch(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (!Object.keys(result.patch).length) {
      return NextResponse.json({ error: "No supported fields were provided." }, { status: 400 });
    }

    const event = await updateGuildEventRoleSlot(guildId, eventId, slotId, result.patch);
    if (!event) {
      return NextResponse.json({ error: "Slot not found for this guild event." }, { status: 404 });
    }

    return NextResponse.json({ event, sync: "discord_sync_pending" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to update event slot." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { guildId, eventId, slotId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const event = await deleteGuildEventRoleSlot(guildId, eventId, slotId);
    if (!event) {
      return NextResponse.json({ error: "Slot not found for this guild event." }, { status: 404 });
    }

    if ("blocked" in event) {
      return NextResponse.json({ error: event.blocked }, { status: 409 });
    }

    return NextResponse.json({ event, sync: "discord_sync_pending" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to delete event slot." }, { status: 500 });
  }
}
