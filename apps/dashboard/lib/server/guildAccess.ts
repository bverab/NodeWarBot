import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { resolveDashboardGuildForServer } from "@/lib/server/dashboardGuildResolution";
import { isLocalAdminSession } from "@/lib/server/localAdmin";

export async function requireDashboardGuild(guildId: string) {
  const session = await getServerAuthSession();

  // The local admin (local testing only) has no Discord token; its guilds come from the bot instead.
  if (!session || (!session.accessToken && !isLocalAdminSession(session))) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  // Guild access is verified with the user's Discord token; a Google sign-in can never satisfy it.
  // A missing provider is a session issued before the provider was stored, and is accepted as before.
  if (session.provider === "google") {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  const guildResult = await resolveDashboardGuildForServer(session, guildId);
  const availableGuilds = guildResult.guilds;
  const activeGuild = guildResult.activeGuild;

  if (!activeGuild) {
    if (guildResult.error) {
      return {
        error: NextResponse.json(
          {
            error: "Discord guild verification is temporarily unavailable. Retry in a moment.",
            code: guildResult.error.code
          },
          { status: guildResult.error.status === 401 || guildResult.error.status === 403 ? 401 : 503 }
        )
      };
    }

    return {
      error: NextResponse.json(
        { error: "Guild not found or Spectre is not installed for this server." },
        { status: 404 }
      )
    };
  }

  return {
    activeGuild,
    availableGuilds,
    session,
    guildSource: guildResult.source,
    guildsStale: guildResult.stale
  };
}

export async function requireManageableDashboardGuild(guildId: string) {
  const access = await requireDashboardGuild(guildId);

  if ("error" in access) {
    return access;
  }

  if (!access.activeGuild.manageable) {
    return {
      error: NextResponse.json({ error: "You do not have permission to manage this guild." }, { status: 403 })
    };
  }

  return access;
}
