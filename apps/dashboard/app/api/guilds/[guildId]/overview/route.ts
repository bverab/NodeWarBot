import { NextResponse } from "next/server";
import { getGuildOverview } from "@/lib/server/dashboardData";
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
    const overview = await getGuildOverview(guildId);
    return NextResponse.json({ guild: access.activeGuild, overview }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to load guild overview." }, { status: 500 });
  }
}
