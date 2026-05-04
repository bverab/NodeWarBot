import { NextResponse } from "next/server";
import { getGuildTemplates } from "@/lib/server/dashboardData";
import { requireDashboardGuild } from "@/lib/server/guildAccess";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

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
