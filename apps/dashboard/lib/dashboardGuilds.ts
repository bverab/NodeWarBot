import type { Session } from "next-auth";
import { fetchAvailableDashboardGuilds, type DashboardGuild } from "@/lib/discord";

export type DashboardGuildSummary = Pick<DashboardGuild, "id" | "name" | "icon" | "owner" | "manageable">;

export function getGuildIconUrl(guild: Pick<DashboardGuildSummary, "id" | "icon">) {
  if (!guild.icon) {
    return null;
  }

  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96`;
}

export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function getDashboardGuilds(session: Session | null): Promise<DashboardGuildSummary[]> {
  if (!session?.accessToken) {
    return [];
  }

  try {
    return await fetchAvailableDashboardGuilds(session.accessToken);
  } catch {
    return [];
  }
}

export function findActiveGuild(guilds: DashboardGuildSummary[], guildId: string) {
  return guilds.find((guild) => guild.id === guildId) ?? null;
}
