import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { fetchAvailableDashboardGuilds } from "@/lib/discord";
import { requireSession } from "@/lib/apiGuards";

export async function GET() {
  const session = await getServerAuthSession();
  const sessionError = requireSession(session);
  if (sessionError) {
    return sessionError;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = session.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Missing Discord access token in session." }, { status: 401 });
  }

  try {
    const guilds = await fetchAvailableDashboardGuilds(accessToken);
    return NextResponse.json({ guilds }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("DISCORD_BOT_TOKEN")
        ? "Dashboard guild filtering is not configured. Set DISCORD_BOT_TOKEN for the web app."
        : "Failed to verify shared Discord guilds for this dashboard.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
