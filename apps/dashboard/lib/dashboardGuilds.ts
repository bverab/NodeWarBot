import type { Session } from "next-auth";
import { DiscordGuildFetchError, fetchAvailableDashboardGuilds, type DashboardGuild } from "@/lib/discord";

export type DashboardGuildSummary = Pick<DashboardGuild, "id" | "name" | "icon" | "owner" | "manageable">;

export type DashboardGuildLoadResult = {
  guilds: DashboardGuildSummary[];
  stale: boolean;
  error: {
    code: string;
    message: string;
    status: number | null;
    retryAfterMs?: number | null;
  } | null;
};

const GUILD_CACHE_TTL_MS = 5 * 60_000;
const guildCache = new Map<string, { guilds: DashboardGuildSummary[]; expiresAt: number }>();
const guildInFlight = new Map<string, Promise<DashboardGuildSummary[]>>();
const guildCooldown = new Map<string, { error: NonNullable<DashboardGuildLoadResult["error"]>; until: number }>();

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

function getCacheKey(session: Session) {
  return session.user?.id ?? session.user?.email ?? session.accessToken ?? "anonymous";
}

function normalizeGuildFetchError(error: unknown) {
  if (error instanceof DiscordGuildFetchError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterMs: error.retryAfterMs,
      status: error.status
    };
  }

  return {
    code: "unknown",
    message: error instanceof Error ? error.message : "Unknown Discord guild lookup error.",
    retryAfterMs: null,
    status: null
  };
}

function logGuildFetchFailure(error: DashboardGuildLoadResult["error"]) {
  if (process.env.NODE_ENV === "production" || !error) {
    return;
  }

  console.warn("[dashboard:guilds] Discord guild lookup failed", {
    code: error.code,
    retryAfterMs: error.retryAfterMs,
    status: error.status,
    message: error.message
  });
}

export function clearDashboardGuildCache() {
  guildCache.clear();
  guildInFlight.clear();
  guildCooldown.clear();
}

export async function getDashboardGuildsDetailed(session: Session | null): Promise<DashboardGuildLoadResult> {
  if (!session?.accessToken) {
    return {
      guilds: [],
      stale: false,
      error: {
        code: "missing_access_token",
        message: "Missing Discord access token in session.",
        status: 401
      }
    };
  }

  const cacheKey = getCacheKey(session);
  const cached = guildCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { guilds: cached.guilds, stale: false, error: null };
  }

  const cooldown = guildCooldown.get(cacheKey);
  if (cooldown && cooldown.until > Date.now()) {
    return {
      guilds: cached?.guilds ?? [],
      stale: Boolean(cached?.guilds.length),
      error: cooldown.error
    };
  }

  try {
    let pending = guildInFlight.get(cacheKey);
    if (!pending) {
      pending = fetchAvailableDashboardGuilds(session.accessToken).finally(() => {
        guildInFlight.delete(cacheKey);
      });
      guildInFlight.set(cacheKey, pending);
    }
    const guilds = await pending;
    guildCache.set(cacheKey, {
      guilds,
      expiresAt: Date.now() + GUILD_CACHE_TTL_MS
    });

    return { guilds, stale: false, error: null };
  } catch (guildError) {
    const error = normalizeGuildFetchError(guildError);
    logGuildFetchFailure(error);

    if (error.code === "rate_limited" && error.retryAfterMs) {
      guildCooldown.set(cacheKey, {
        error,
        until: Date.now() + error.retryAfterMs
      });
    }

    if (cached && cached.expiresAt > Date.now()) {
      return {
        guilds: cached.guilds,
        stale: true,
        error
      };
    }

    return {
      guilds: [],
      stale: false,
      error
    };
  }
}

export async function getDashboardGuilds(session: Session | null): Promise<DashboardGuildSummary[]> {
  const result = await getDashboardGuildsDetailed(session);
  return result.guilds;
}

export function findActiveGuild(guilds: DashboardGuildSummary[], guildId: string) {
  return guilds.find((guild) => guild.id === guildId) ?? null;
}
