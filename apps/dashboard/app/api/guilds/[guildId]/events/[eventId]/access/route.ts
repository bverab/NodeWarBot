import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/apiErrors";
import { updatePveEventAccess } from "@/lib/server/dashboardData";
import { getGuildRoles } from "@/lib/server/discordGuildConfig";
import { fetchMemberRoleIds, validateAccessUsers } from "@/lib/server/discordMemberAccess";
import { syncPublishedEventMessage } from "@/lib/server/eventMessageSync";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { prisma } from "@/lib/server/prisma";
import { MAX_PVE_ACCESS_ENTRIES, PVE_ACCESS_MODES } from "@/lib/pveAccessModes";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string }>;
};

const snowflake = z.string().trim().regex(/^\d{5,32}$/);

const accessSchema = z
  .object({
    accessMode: z.enum(PVE_ACCESS_MODES),
    roleIds: z.array(snowflake).max(MAX_PVE_ACCESS_ENTRIES).default([]),
    userIds: z.array(snowflake).max(MAX_PVE_ACCESS_ENTRIES).default([])
  })
  .superRefine((value, context) => {
    if (value.accessMode === "ROLES" && !value.roleIds.length) {
      context.addIssue({ code: "custom", path: ["roleIds"], message: "Select at least one role with access." });
    }
    if (value.accessMode === "USERS" && !value.userIds.length) {
      context.addIssue({ code: "custom", path: ["userIds"], message: "Select at least one person with access." });
    }
  });

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status: 400 });
}

// Replaces who joins a PvE event as a main signup. Fillers who now qualify move up, and a published event's Discord
// message is refreshed so it shows the new access.
export async function PUT(request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = accessSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid access input.");
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, guildId },
      select: { id: true, eventType: true, channelId: true, messageId: true }
    });
    if (!event) {
      return NextResponse.json({ ok: false, error: "Event not found for this guild." }, { status: 404 });
    }
    if (event.eventType !== "pve") {
      return badRequest("Access by roles or people applies to PvE events only.");
    }

    if (parsed.data.roleIds.length) {
      const guildRoleIds = new Set((await getGuildRoles(guildId)).map((role) => role.id));
      if (parsed.data.roleIds.some((roleId) => !guildRoleIds.has(roleId))) {
        return badRequest("One or more selected roles are not available for this guild.");
      }
    }

    if (parsed.data.userIds.length) {
      const { rejected } = await validateAccessUsers(guildId, parsed.data.userIds, event.channelId);
      if (rejected.length) {
        return badRequest("Some selected people left the server, are bots or cannot see the event channel.", { rejectedUserIds: rejected });
      }
    }

    const result = await updatePveEventAccess(guildId, event.id, parsed.data, {
      resolveMemberRoleIds: (userId) => fetchMemberRoleIds(guildId, userId)
    });
    if (!result) {
      return NextResponse.json({ ok: false, error: "Event not found for this guild." }, { status: 404 });
    }

    // The access is saved either way; a failed refresh is reported so the message can be synced again.
    const sync = event.messageId ? await syncPublishedEventMessage(guildId, event.id) : null;
    return NextResponse.json(
      {
        ok: true,
        promoted: result.promoted,
        synced: Boolean(sync?.ok),
        ...(sync && !sync.ok ? { syncError: sync.error } : {})
      },
      { status: 200 }
    );
  } catch (error) {
    return errorResponse(error, "Failed to update event access.");
  }
}
