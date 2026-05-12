export type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

export type DashboardGuild = DiscordGuild & {
  manageable: boolean;
};

const DISCORD_API_BASE_URL = "https://discord.com/api";
const ADMINISTRATOR_PERMISSION = 0x8n;
const MANAGE_GUILD_PERMISSION = 0x20n;

export type DiscordGuildFetchErrorCode =
  | "missing_bot_token"
  | "user_guilds_failed"
  | "bot_guilds_failed"
  | "rate_limited"
  | "unexpected_response";

export class DiscordGuildFetchError extends Error {
  code: DiscordGuildFetchErrorCode;
  retryAfterMs: number | null;
  status: number | null;

  constructor(code: DiscordGuildFetchErrorCode, message: string, status: number | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = "DiscordGuildFetchError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function hasPermission(permissions: string, flag: bigint) {
  try {
    return (BigInt(permissions) & flag) === flag;
  } catch {
    return false;
  }
}

function getBotToken() {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.TOKEN;
  return token?.replace(/^Bot\s+/i, "");
}

async function getRetryAfterMs(response: Response) {
  const header = response.headers.get("retry-after");
  const headerSeconds = header ? Number(header) : NaN;
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
    return Math.ceil(headerSeconds * 1000);
  }

  const body = (await response.clone().json().catch(() => null)) as { retry_after?: unknown } | null;
  const bodySeconds = typeof body?.retry_after === "number" ? body.retry_after : Number(body?.retry_after);
  return Number.isFinite(bodySeconds) && bodySeconds > 0 ? Math.ceil(bodySeconds * 1000) : null;
}

export async function fetchUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const response = await fetch(`${DISCORD_API_BASE_URL}/users/@me/guilds`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new DiscordGuildFetchError(
        "rate_limited",
        "Discord user guild API request was rate limited.",
        response.status,
        await getRetryAfterMs(response)
      );
    }

    throw new DiscordGuildFetchError(
      "user_guilds_failed",
      `Discord user guild API request failed with status ${response.status}.`,
      response.status
    );
  }

  const guilds = (await response.json()) as unknown;
  if (!Array.isArray(guilds)) {
    throw new DiscordGuildFetchError("unexpected_response", "Discord user guild API returned an unexpected shape.");
  }

  return (guilds as DiscordGuild[]).map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon ?? null,
    owner: Boolean(guild.owner),
    permissions: guild.permissions
  }));
}

export async function fetchBotGuildIds(): Promise<Set<string>> {
  const botToken = getBotToken();

  if (!botToken) {
    throw new DiscordGuildFetchError("missing_bot_token", "Missing DISCORD_BOT_TOKEN.");
  }

  const response = await fetch(`${DISCORD_API_BASE_URL}/users/@me/guilds`, {
    headers: {
      Authorization: `Bot ${botToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new DiscordGuildFetchError(
        "rate_limited",
        "Discord bot guild API request was rate limited.",
        response.status,
        await getRetryAfterMs(response)
      );
    }

    throw new DiscordGuildFetchError(
      "bot_guilds_failed",
      `Discord bot guild API request failed with status ${response.status}.`,
      response.status
    );
  }

  const guilds = (await response.json()) as unknown;
  if (!Array.isArray(guilds)) {
    throw new DiscordGuildFetchError("unexpected_response", "Discord bot guild API returned an unexpected shape.");
  }

  return new Set((guilds as Array<Pick<DiscordGuild, "id">>).map((guild) => guild.id));
}

export async function fetchAvailableDashboardGuilds(accessToken: string): Promise<DashboardGuild[]> {
  const [userGuilds, botGuildIds] = await Promise.all([fetchUserGuilds(accessToken), fetchBotGuildIds()]);

  return userGuilds
    .filter((guild) => botGuildIds.has(guild.id))
    .map((guild) => ({
      ...guild,
      manageable:
        guild.owner ||
        hasPermission(guild.permissions, ADMINISTRATOR_PERMISSION) ||
        hasPermission(guild.permissions, MANAGE_GUILD_PERMISSION)
    }));
}
