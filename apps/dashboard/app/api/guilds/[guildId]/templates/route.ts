import { NextResponse } from "next/server";
import { getGuildTemplates } from "@/lib/server/dashboardData";
import { z } from "zod";
import { createGuildTemplate } from "@/lib/server/dashboardData";
import { getGuildRoles } from "@/lib/server/discordGuildConfig";
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

const createTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  eventType: z.enum(["war", "siege", "10v10"]),
  typeDefault: z.string().trim().min(1).max(64),
  timezone: timezoneSchema,
  time: timeSchema.nullable().optional(),
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
    .min(1)
    .max(100)
}).superRefine((value, context) => {
  const names = value.slots.map((slot) => slot.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: "custom", path: ["slots"], message: "Slot names must be unique." });
  }
});

export async function GET(_request: Request, context: RouteContext) {
  const { guildId } = await context.params;
  const access = await requireDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const templates = await getGuildTemplates(guildId);
    return NextResponse.json({ guild: access.activeGuild, templates }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to load guild templates." }, { status: 500 });
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
    const parsed = createTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid template input." }, { status: 400 });
    }

    const roles = await getGuildRoles(guildId);
    const roleIds = new Set(roles.map((role) => role.id));
    const inputRoleIds = parsed.data.slots.flatMap((slot) => slot.allowedRoleIds ?? []);

    if (inputRoleIds.some((roleId) => !roleIds.has(roleId))) {
      return NextResponse.json({ error: "One or more selected roles are not available for this guild." }, { status: 400 });
    }

    const template = await createGuildTemplate(guildId, parsed.data);
    return NextResponse.json({ templateId: template.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create template.";
    const status = message.includes("Unique constraint") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
