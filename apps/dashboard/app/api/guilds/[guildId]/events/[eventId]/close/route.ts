import { NextResponse } from "next/server";
import { setGuildEventClosed } from "@/lib/server/dashboardData";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const event = await setGuildEventClosed(guildId, eventId, true);

    if (!event) {
      return NextResponse.json({ error: "Event not found for this guild." }, { status: 404 });
    }

    return NextResponse.json({ event, sync: "discord_sync_pending" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to close signups." }, { status: 500 });
  }
}
