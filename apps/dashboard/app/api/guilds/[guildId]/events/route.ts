import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/apiGuards";
import { createGuildEventDraft, getGuildEvents } from "@/lib/server/dashboardData";
import { getGuildPostChannelById, getGuildPostChannels, getGuildRoles } from "@/lib/server/discordGuildConfig";
import { requireDashboardGuild, requireManageableDashboardGuild } from "@/lib/server/guildAccess";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

const timeSchema = z.string().regex(/^\d{1,2}:\d{2}$/).refine((value) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}, "Time must use HH:mm format.");

const timezoneSchema = z.string().min(1).max(64).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}, "Timezone must be a valid IANA timezone.");

const createEventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  eventType: z.enum(["war", "siege", "pve", "10v10"]),
  type: z.string().trim().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: timeSchema,
  timezone: timezoneSchema,
  duration: z.coerce.number().int().min(1).max(1440),
  closeBeforeMinutes: z.coerce.number().int().min(0).max(1440),
  channelId: z.string().trim().regex(/^\d{5,32}$/).nullable().optional(),
  accessRoleIds: z.array(z.string().trim().regex(/^\d{5,32}$/)).max(25).optional(),
  notifyRoleIds: z.array(z.string().trim().regex(/^\d{5,32}$/)).max(25).optional(),
  recurrence: z.enum(["single", "weekly"]).optional(),
  recap: z.object({
    enabled: z.boolean(),
    minutesBeforeExpire: z.coerce.number().int().min(0).max(1440),
    messageText: z.string().trim().max(1000)
  }).optional(),
  pveOptions: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        time: timeSchema,
        capacity: z.coerce.number().int().min(1).max(100),
        position: z.coerce.number().int().min(0).max(999).optional()
      })
    )
    .max(30)
    .optional(),
  templateId: z.string().trim().min(1).max(128).optional(),
  slots: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        max: z.coerce.number().int().min(1).max(100),
        position: z.coerce.number().int().min(0).max(999).optional(),
        emoji: z.string().trim().max(128).nullable().optional(),
        emojiSource: z.string().trim().max(64).nullable().optional(),
        allowedRoleIds: z.array(z.string().trim().regex(/^\d{5,32}$/)).max(25).optional()
      })
    )
    .max(100)
    .optional()
}).superRefine((value, context) => {
  const startsAt = new Date(`${value.date}T${value.time}:00Z`);
  if (Number.isNaN(startsAt.getTime())) {
    context.addIssue({ code: "custom", path: ["date"], message: "Date must be valid." });
  }

  if (value.eventType === "pve" && !value.templateId && !value.pveOptions?.length) {
    context.addIssue({ code: "custom", path: ["pveOptions"], message: "Add at least one PvE time option." });
  }

  if (value.eventType !== "pve" && !value.templateId && !value.slots?.length) {
    context.addIssue({ code: "custom", path: ["slots"], message: "Select a template or add at least one manual slot." });
  }

  if (value.closeBeforeMinutes > value.duration) {
    context.addIssue({ code: "custom", path: ["closeBeforeMinutes"], message: "Close before expiry cannot exceed duration." });
  }

  if (value.slots?.length) {
    const names = value.slots.map((slot) => slot.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: "custom", path: ["slots"], message: "Slot names must be unique." });
    }
  }

  if (value.pveOptions?.length) {
    const times = value.pveOptions.map((option) => option.time);
    if (new Set(times).size !== times.length) {
      context.addIssue({ code: "custom", path: ["pveOptions"], message: "PvE option times must be unique." });
    }
  }
});

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
    const body = (await request.json()) as unknown;
    const parsed = createEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid event input." }, { status: 400 });
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
      return NextResponse.json({ error: "One or more selected roles are not available for this guild." }, { status: 400 });
    }

    if (parsed.data.channelId && !channelIds.has(parsed.data.channelId)) {
      const manualChannel = await getGuildPostChannelById(guildId, parsed.data.channelId);
      if (!manualChannel) {
        return NextResponse.json({ error: "Selected channel is not available for this guild." }, { status: 400 });
      }
    }

    const event = await createGuildEventDraft(guildId, getSessionUserId(access.session), parsed.data);

    return NextResponse.json({ eventId: event.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create draft event.";
    const status = message.includes("Template not found") || message.includes("At least one slot") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
