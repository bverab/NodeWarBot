import { NextResponse } from "next/server";
import { getGuildEmojis } from "@/lib/server/discordEmojis";
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

  const emojis = await getGuildEmojis(guildId);
  return NextResponse.json({ emojis }, { status: 200 });
}
