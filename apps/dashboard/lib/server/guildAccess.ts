import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { findActiveGuild, getDashboardGuilds } from "@/lib/dashboardGuilds";

export async function requireDashboardGuild(guildId: string) {
  const session = await getServerAuthSession();

  if (!session?.accessToken) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  const availableGuilds = await getDashboardGuilds(session);
  const activeGuild = findActiveGuild(availableGuilds, guildId);

  if (!activeGuild) {
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
