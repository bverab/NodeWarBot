import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/apiErrors";
import { searchChannelMembers } from "@/lib/server/discordMemberAccess";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { isDiscordSnowflake } from "@/lib/discordSnowflake";

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

const MAX_QUERY_LENGTH = 32;

// Member search for the PvE "By people" picker: matches the start of a username or nickname and says whether each
// member can see the event channel.
export async function GET(request: Request, context: RouteContext) {
  const { guildId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  const params = new URL(request.url).searchParams;
  const query = (params.get("query") ?? "").trim();
  const channelId = params.get("channelId") || null;

  if (!query || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: `Type 1 to ${MAX_QUERY_LENGTH} characters to search members.` }, { status: 400 });
  }
  if (channelId && !isDiscordSnowflake(channelId)) {
    return NextResponse.json({ error: "Invalid Discord channel ID." }, { status: 400 });
  }

  try {
    const members = await searchChannelMembers(guildId, query, channelId);
    return NextResponse.json({ members }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to search guild members.");
  }
}
