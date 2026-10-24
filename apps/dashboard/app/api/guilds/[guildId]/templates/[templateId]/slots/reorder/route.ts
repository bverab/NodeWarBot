import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/apiErrors";
import { reorderGuildTemplateRoleSlots } from "@/lib/server/dashboardData";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { INVALID_BODY_ERROR, parseSlotReorder, readJsonObject } from "@/lib/server/mutationValidation";

type RouteContext = {
  params: Promise<{ guildId: string; templateId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
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

    const parsed = parseSlotReorder(body.slots);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const template = await reorderGuildTemplateRoleSlots(guildId, templateId, parsed.slots);
    if (!template) {
      return NextResponse.json({ error: "One or more slots were not found for this guild template." }, { status: 404 });
    }

    if ("error" in template) {
      return NextResponse.json({ error: template.error }, { status: 400 });
    }

    return NextResponse.json({ template }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to reorder template slots.", { conflictMessage: "Another slot already uses one of those positions." });
  }
}
