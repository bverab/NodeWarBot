import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/apiErrors";
import { deleteGuildEventRoleSlot, updateGuildEventRoleSlot, updateGuildEventRoleSlotSeries } from "@/lib/server/dashboardData";
import { getGuildRoles } from "@/lib/server/discordGuildConfig";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { INVALID_BODY_ERROR, parseRoleSlotPatch, readJsonObject } from "@/lib/server/mutationValidation";

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
    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: INVALID_BODY_ERROR }, { status: 400 });
    }
    const recurrenceScope = body.recurrenceScope === "series" ? "series" : "single";
    delete body.recurrenceScope;
    const result = parseRoleSlotPatch(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (!Object.keys(result.patch).length) {
      return NextResponse.json({ error: "No supported fields were provided." }, { status: 400 });
    }

    if (Array.isArray(result.patch.allowedRoleIds)) {
      const roles = await getGuildRoles(guildId);
      const roleIds = new Set(roles.map((role) => role.id));
      if (result.patch.allowedRoleIds.some((roleId) => !roleIds.has(roleId))) {
        return NextResponse.json(
          { error: "One or more selected roles are not available for this guild." },
          { status: 400 }
        );
      }
    }

    const event = recurrenceScope === "series"
      ? await updateGuildEventRoleSlotSeries(guildId, eventId, slotId, result.patch)
      : await updateGuildEventRoleSlot(guildId, eventId, slotId, result.patch);
    if (!event) {
      return NextResponse.json({ error: "Slot not found for this guild event." }, { status: 404 });
    }

    return NextResponse.json({ event, sync: "discord_sync_pending" }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to update event slot.", { conflictMessage: "A slot with that name or position already exists." });
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
  } catch (error) {
    return errorResponse(error, "Failed to delete event slot.");
  }
}
