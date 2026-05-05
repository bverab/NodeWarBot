import { NextResponse } from "next/server";
import { getGuildPostChannels } from "@/lib/server/discordGuildConfig";
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

  const channels = await getGuildPostChannels(guildId);
  return NextResponse.json({ channels }, { status: 200 });
}
