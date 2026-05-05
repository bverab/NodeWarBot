import { NextResponse } from "next/server";
import { archiveGuildTemplate } from "@/lib/server/dashboardData";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";

type RouteContext = {
  params: Promise<{ guildId: string; templateId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { guildId, templateId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const template = await archiveGuildTemplate(guildId, templateId);

    if (!template) {
      return NextResponse.json({ error: "Template not found for this guild." }, { status: 404 });
    }

    return NextResponse.json({ template, status: "archived" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to archive template." }, { status: 500 });
  }
}
