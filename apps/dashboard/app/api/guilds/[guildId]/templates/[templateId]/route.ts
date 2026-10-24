import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/apiErrors";
import { getGuildTemplateDetail, updateGuildTemplate } from "@/lib/server/dashboardData";
import { requireDashboardGuild, requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { INVALID_BODY_ERROR, parseTemplatePatch, readJsonObject } from "@/lib/server/mutationValidation";

type RouteContext = {
  params: Promise<{ guildId: string; templateId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { guildId, templateId } = await context.params;
  const access = await requireDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const template = await getGuildTemplateDetail(guildId, templateId);

    if (!template) {
      return NextResponse.json({ error: "Template not found for this guild." }, { status: 404 });
    }

    return NextResponse.json({ guild: access.activeGuild, template }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to load template details." }, { status: 500 });
  }
}

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
    const result = parseTemplatePatch(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (!Object.keys(result.patch).length) {
      return NextResponse.json({ error: "No supported fields were provided." }, { status: 400 });
    }

    const template = await updateGuildTemplate(guildId, templateId, result.patch);
    if (!template) {
      return NextResponse.json({ error: "Template not found for this guild." }, { status: 404 });
    }

    return NextResponse.json({ template, sync: "discord_sync_pending" }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to update template.", {
      conflictMessage: "A template with that name already exists for this event type."
    });
  }
}
