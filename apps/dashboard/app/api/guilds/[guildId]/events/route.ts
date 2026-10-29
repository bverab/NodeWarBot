import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/apiGuards";
import { calculateEventLifecycleDates, formatDateTimeInTimezone } from "@/lib/eventDateTime";
import { errorResponse } from "@/lib/server/apiErrors";
import { createGuildEventDraft, getGuildEvents } from "@/lib/server/dashboardData";
import { createVerifiedGuildsCookie } from "@/lib/server/dashboardGuildVerificationCookie";
import { createEventSchema, formatCreateEventIssues } from "@/lib/server/createEventValidation";
import { getGuildPostChannelById, getGuildPostChannels, getGuildRoles } from "@/lib/server/discordGuildConfig";
import { validateAccessUsers } from "@/lib/server/discordMemberAccess";
import { requireDashboardGuild, requireManageableDashboardGuild } from "@/lib/server/guildAccess";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

function logCreateFailure(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[dashboard:event-create]", { message, ...details });
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { guildId } = await context.params;
  const access = await requireDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const events = await getGuildEvents(guildId);
    return NextResponse.json({ guild: access.activeGuild, events }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to load guild events." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { guildId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = createEventSchema.safeParse(body);

    if (!parsed.success) {
      const issues = formatCreateEventIssues(parsed.error);
      logCreateFailure("schema validation failed", {
        issues,
        body
      });
      return NextResponse.json(
        { ok: false, error: issues[0]?.message ?? "Invalid event input.", issues },
        { status: 400 }
      );
    }

    const [roles, channels] = await Promise.all([getGuildRoles(guildId), getGuildPostChannels(guildId)]);
    const roleIds = new Set(roles.map((role) => role.id));
    const channelIds = new Set(channels.map((channel) => channel.id));
    const inputRoleIds = [
      ...(parsed.data.accessRoleIds ?? []),
      ...(parsed.data.notifyRoleIds ?? []),
      ...(parsed.data.slots ?? []).flatMap((slot) => slot.allowedRoleIds ?? [])
    ];

    if (inputRoleIds.some((roleId) => !roleIds.has(roleId))) {
      const issues = [{ path: "roles", message: "One or more selected roles are not available for this guild." }];
      logCreateFailure("role validation failed", { issues, inputRoleIds, roleCount: roles.length });
      return NextResponse.json({ ok: false, error: issues[0].message, issues }, { status: 400 });
    }

    if (parsed.data.eventType === "pve" && parsed.data.accessMode === "USERS") {
      const { rejected } = await validateAccessUsers(guildId, parsed.data.accessUserIds ?? [], parsed.data.channelId);
      if (rejected.length) {
        const issues = [{ path: "accessUserIds", message: "Some selected people left the server, are bots or cannot see the target channel." }];
        logCreateFailure("access user validation failed", { issues, rejected });
        return NextResponse.json({ ok: false, error: issues[0].message, issues, rejectedUserIds: rejected }, { status: 400 });
      }
    }

    if (parsed.data.channelId && !channelIds.has(parsed.data.channelId)) {
      const manualChannel = await getGuildPostChannelById(guildId, parsed.data.channelId);
      if (!manualChannel) {
        const issues = [{ path: "channelId", message: "Selected channel is not available for this guild." }];
        logCreateFailure("channel validation failed", { issues, channelId: parsed.data.channelId, channelCount: channels.length });
        return NextResponse.json({ ok: false, error: issues[0].message, issues }, { status: 400 });
      }
    }

    if (process.env.NODE_ENV === "development") {
      const lifecycle = calculateEventLifecycleDates({
        date: parsed.data.date,
        time: parsed.data.time,
        timezone: parsed.data.timezone,
        duration: parsed.data.duration,
        closeBeforeMinutes: parsed.data.closeBeforeMinutes
      });
      console.info("[dashboard:event-time] create draft input", {
        date: parsed.data.date,
        time: parsed.data.time,
        timezone: parsed.data.timezone,
        duration: parsed.data.duration,
        closeBeforeMinutes: parsed.data.closeBeforeMinutes,
        startsAtUtc: lifecycle?.startsAt.toISOString() ?? null,
        startsAtLocal: formatDateTimeInTimezone(lifecycle?.startsAt, parsed.data.timezone),
        closesAtLocal: formatDateTimeInTimezone(lifecycle?.closesAt, parsed.data.timezone),
        expiresAtLocal: formatDateTimeInTimezone(lifecycle?.expiresAt, parsed.data.timezone)
      });
    }

    const event = await createGuildEventDraft(guildId, getSessionUserId(access.session), parsed.data);

    const response = NextResponse.json({ eventId: event.id }, { status: 201 });
    // Only guilds that Discord has just verified may be signed. Guilds that came out of the cookie itself (or stale data)
    // must not be re-signed, otherwise the cookie would renew itself without ever asking Discord again.
    if (access.guildSource === "discord" && !access.guildsStale) {
      const cookie = createVerifiedGuildsCookie(access.availableGuilds, getSessionUserId(access.session));
      if (cookie) {
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
    }
    return response;
  } catch (error) {
    return errorResponse(error, "Failed to create draft event.");
  }
}
