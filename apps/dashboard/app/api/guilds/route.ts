import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { fetchUserGuilds } from "@/lib/discord";
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
    const guilds = await fetchUserGuilds(accessToken);
    return NextResponse.json({ guilds }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch guilds from Discord." }, { status: 502 });
  }
}
