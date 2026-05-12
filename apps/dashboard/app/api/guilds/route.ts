import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { requireSession } from "@/lib/apiGuards";
import { getDashboardGuildsDetailed } from "@/lib/dashboardGuilds";
import { createVerifiedGuildsCookie, readVerifiedGuildsCookie } from "@/lib/server/dashboardGuildVerificationCookie";

export async function GET() {
  const session = await getServerAuthSession();
  const sessionError = requireSession(session);
  if (sessionError) {
    return sessionError;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cachedGuilds = await readVerifiedGuildsCookie();
  if (cachedGuilds.length) {
    return NextResponse.json(
      {
        guilds: cachedGuilds,
        stale: true,
        warning: "Showing recently verified guilds. Refresh guild access later if permissions changed.",
        code: "verified_cookie"
      },
      { status: 200 }
    );
  }

  const result = await getDashboardGuildsDetailed(session);
  if (result.error && !result.guilds.length) {
    if (result.error.code === "missing_access_token") {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 401 });
    }

    if (result.error.code === "missing_bot_token") {
      return NextResponse.json(
        {
          error: "Dashboard guild filtering is not configured. Set DISCORD_BOT_TOKEN for the web app.",
          code: result.error.code
        },
        { status: 500 }
      );
    }

    const status = result.error.status === 401 || result.error.status === 403 ? 401 : 503;
    return NextResponse.json(
      {
        error: "Discord guild verification is temporarily unavailable. Retry in a moment.",
        code: result.error.code,
        retryAfterMs: result.error.retryAfterMs
      },
      { status }
    );
  }

  const response = NextResponse.json(
    {
      guilds: result.guilds,
      stale: result.stale,
      warning: result.stale ? "Showing recently verified guilds because Discord guild verification is temporarily unavailable." : undefined,
      code: result.error?.code
    },
    { status: 200 }
  );
  if (result.guilds.length && !result.stale) {
    const cookie = createVerifiedGuildsCookie(result.guilds);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}
