import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { getApplicationEmojis, getApplicationId } from "@/lib/server/discordEmojis";

export async function GET() {
  const session = await getServerAuthSession();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DISCORD_BOT_TOKEN && !process.env.TOKEN) {
    return NextResponse.json({ emojis: [], error: "DISCORD_BOT_TOKEN is required to load Spectre emojis." }, { status: 200 });
  }

  if (!getApplicationId()) {
    return NextResponse.json({ emojis: [], error: "Application ID is not configured for Spectre emojis." }, { status: 200 });
  }

  const emojis = await getApplicationEmojis();
  return NextResponse.json({ emojis }, { status: 200 });
}
