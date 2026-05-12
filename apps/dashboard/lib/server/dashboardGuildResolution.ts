import "server-only";
import type { Session } from "next-auth";
import { findActiveGuild, getDashboardGuildsDetailed, type DashboardGuildLoadResult } from "@/lib/dashboardGuilds";
import { readVerifiedGuildsCookie } from "@/lib/server/dashboardGuildVerificationCookie";

function cookieResult(guilds: Awaited<ReturnType<typeof readVerifiedGuildsCookie>>, error: DashboardGuildLoadResult["error"] = null) {
  return {
    guilds,
    stale: Boolean(error),
    error
  };
}

export async function getDashboardGuildsForServer(session: Session | null, options: { preferCookie?: boolean } = {}) {
  const cookieGuilds = await readVerifiedGuildsCookie();
  if (options.preferCookie !== false && cookieGuilds.length) {
    return cookieResult(cookieGuilds);
  }

  const result = await getDashboardGuildsDetailed(session);
  if (!result.error || result.guilds.length) {
    return result;
  }

  if (cookieGuilds.length) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[dashboard:guild-resolution] using verified guild cookie after guild lookup failure", {
        code: result.error.code,
        retryAfterMs: result.error.retryAfterMs,
        status: result.error.status
      });
    }

    return cookieResult(cookieGuilds, result.error);
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("[dashboard:guild-resolution] guild lookup failed without usable fallback", {
      code: result.error.code,
      retryAfterMs: result.error.retryAfterMs,
      status: result.error.status
    });
  }

  return result;
}

export async function resolveDashboardGuildForServer(session: Session | null, guildId: string) {
  const result = await getDashboardGuildsForServer(session);
  const activeGuild = findActiveGuild(result.guilds, guildId);

  if (!activeGuild && result.error && process.env.NODE_ENV !== "production") {
    console.warn("[dashboard:guild-resolution] active guild unavailable", {
      guildId,
      code: result.error.code,
      status: result.error.status,
      stale: result.stale,
      guildCount: result.guilds.length
    });
  }

  return {
    ...result,
    activeGuild
  };
}
