import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/apiErrors";
import { createGuildTemplateRoleSlot } from "@/lib/server/dashboardData";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { INVALID_BODY_ERROR, parseRoleSlotPatch, readJsonObject } from "@/lib/server/mutationValidation";

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
    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: INVALID_BODY_ERROR }, { status: 400 });
    }
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
  } catch (error) {
    return errorResponse(error, "Failed to create template slot.", { conflictMessage: "A slot with that name or position already exists." });
  }
}
