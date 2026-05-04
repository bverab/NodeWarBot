import { NextResponse } from "next/server";
import { createGuildTemplateRoleSlot } from "@/lib/server/dashboardData";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { parseRoleSlotPatch } from "@/lib/server/mutationValidation";

type RouteContext = {
  params: Promise<{ guildId: string; templateId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { guildId, templateId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = parseRoleSlotPatch(body, true);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const template = await createGuildTemplateRoleSlot(guildId, templateId, {
      name: result.patch.name as string,
      max: result.patch.max as number,
      position: result.patch.position,
      emoji: result.patch.emoji,
      emojiSource: result.patch.emojiSource
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found for this guild." }, { status: 404 });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create template slot." }, { status: 500 });
  }
}
