import { redirect } from "next/navigation";
import { routes } from "@/constants/routes";
import { getServerAuthSession } from "@/lib/auth";
import type { DashboardGuildSummary } from "@/lib/dashboardGuilds";
import { resolveDashboardGuildForServer } from "@/lib/server/dashboardGuildResolution";
import { previewGuilds } from "@/components/dashboard/guilds/previewData";

export type GuildPageContext = {
  activeGuild: DashboardGuildSummary | null;
  availableGuilds: DashboardGuildSummary[];
  guildResolutionError: string | null;
  preview: boolean;
  session: Awaited<ReturnType<typeof getServerAuthSession>>;
};

export async function getGuildPageContext(guildId: string, preview = false): Promise<GuildPageContext> {
  const session = await getServerAuthSession();

  if (!session && !preview) {
    redirect(routes.login);
  }

  const guildResult = preview
    ? { guilds: previewGuilds, stale: false, error: null, activeGuild: previewGuilds.find((guild) => guild.id === guildId) ?? null }
    : await resolveDashboardGuildForServer(session, guildId);

  return {
    activeGuild: guildResult.activeGuild,
    availableGuilds: guildResult.guilds,
    guildResolutionError: guildResult.error ? "Discord guild verification is temporarily unavailable. Retry in a moment." : null,
    preview,
    session
  };
}
