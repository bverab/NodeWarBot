import "server-only";
import type { Session } from "next-auth";
import { getDashboardGuildsDetailed, type DashboardGuildLoadResult, type DashboardGuildSummary } from "@/lib/dashboardGuilds";
import { DiscordGuildFetchError, fetchBotDashboardGuilds } from "@/lib/discord";
import { isLocalAdminSession } from "@/lib/server/localAdmin";

// Server-side entry point for "which guilds can this session see". lib/dashboardGuilds.ts stays client-safe,
// so the local admin (which manages every guild the bot is in) is handled here.
export async function getDashboardGuildsForSession(session: Session | null): Promise<DashboardGuildLoadResult> {
  if (!isLocalAdminSession(session)) {
    return getDashboardGuildsDetailed(session);
  }

  try {
    return { guilds: await fetchBotDashboardGuilds(), stale: false, error: null };
  } catch (error) {
    const fetchError = error instanceof DiscordGuildFetchError ? error : null;
    return {
      guilds: [],
      stale: false,
      error: {
        code: fetchError?.code ?? "unknown",
        message: error instanceof Error ? error.message : "Unknown Discord guild lookup error.",
        status: fetchError?.status ?? null,
        retryAfterMs: fetchError?.retryAfterMs ?? null
      }
    };
  }
}

export async function getDashboardGuildSummariesForSession(session: Session | null): Promise<DashboardGuildSummary[]> {
  return (await getDashboardGuildsForSession(session)).guilds;
}
