import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { resolveDashboardGuildForServer } from "@/lib/server/dashboardGuildResolution";

export async function requireDashboardGuild(guildId: string) {
  const session = await getServerAuthSession();

  if (!session?.accessToken) {
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
    session
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
