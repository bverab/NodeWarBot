import { redirect } from "next/navigation";
import { routes } from "@/constants/routes";
import { getServerAuthSession } from "@/lib/auth";
import { findActiveGuild, getDashboardGuilds, type DashboardGuildSummary } from "@/lib/dashboardGuilds";
import { previewGuilds } from "@/components/dashboard/guilds/previewData";

export type GuildPageContext = {
  activeGuild: DashboardGuildSummary | null;
  availableGuilds: DashboardGuildSummary[];
  preview: boolean;
  session: Awaited<ReturnType<typeof getServerAuthSession>>;
};

export async function getGuildPageContext(guildId: string, preview = false): Promise<GuildPageContext> {
  const session = await getServerAuthSession();

  if (!session && !preview) {
    redirect(routes.login);
  }

  const availableGuilds = preview ? previewGuilds : await getDashboardGuilds(session);

  return {
    activeGuild: findActiveGuild(availableGuilds, guildId),
    availableGuilds,
    preview,
    session
  };
}
