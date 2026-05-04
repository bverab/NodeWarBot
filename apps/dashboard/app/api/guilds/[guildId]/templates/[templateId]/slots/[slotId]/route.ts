import { NextResponse } from "next/server";
import { deleteGuildTemplateRoleSlot, updateGuildTemplateRoleSlot } from "@/lib/server/dashboardData";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { parseRoleSlotPatch } from "@/lib/server/mutationValidation";

type RouteContext = {
  params: Promise<{ guildId: string; templateId: string; slotId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { guildId, templateId, slotId } = await context.params;
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

    const template = await updateGuildTemplateRoleSlot(guildId, templateId, slotId, result.patch);
    if (!template) {
      return NextResponse.json({ error: "Slot not found for this guild template." }, { status: 404 });
    }

    return NextResponse.json({ template }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to update template slot." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { guildId, templateId, slotId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const template = await deleteGuildTemplateRoleSlot(guildId, templateId, slotId);
    if (!template) {
      return NextResponse.json({ error: "Slot not found for this guild template." }, { status: 404 });
    }

    return NextResponse.json({ template }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to delete template slot." }, { status: 500 });
  }
}
