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

const BOT_GUILDS_PAGE_SIZE = 200;
const BOT_GUILDS_MAX_PAGES = 100;
const BOT_GUILD_IDS_CACHE_TTL_MS = 60_000;

// The bot's guild list is the same for every dashboard user: one short-lived cache and one in-flight lookup are shared.
type BotGuildsSnapshot = { guilds: DiscordGuild[]; ids: Set<string>; expiresAt: number };

let botGuildsCache: BotGuildsSnapshot | null = null;
let botGuildsInFlight: Promise<BotGuildsSnapshot> | null = null;

function getLastGuildId(guilds: Array<Pick<DiscordGuild, "id">>) {
  try {
    return guilds.reduce((max, guild) => (BigInt(guild.id) > BigInt(max) ? guild.id : max), guilds[0].id);
  } catch {
    return guilds[guilds.length - 1].id;
  }
}

async function fetchBotGuildsFromDiscord(botToken: string): Promise<DiscordGuild[]> {
  const guildsById = new Map<string, DiscordGuild>();
  let after: string | null = null;

  for (let pageIndex = 0; pageIndex < BOT_GUILDS_MAX_PAGES; pageIndex += 1) {
    const url = new URL(`${DISCORD_API_BASE_URL}/users/@me/guilds`);
    url.searchParams.set("limit", String(BOT_GUILDS_PAGE_SIZE));
    if (after) {
      url.searchParams.set("after", after);
    }

    const response = await fetch(url.toString(), {
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

    const page = guilds as Array<Partial<DiscordGuild> & Pick<DiscordGuild, "id">>;
    for (const guild of page) {
      guildsById.set(guild.id, {
        id: guild.id,
        name: guild.name ?? guild.id,
        icon: guild.icon ?? null,
        owner: Boolean(guild.owner),
        permissions: guild.permissions ?? "0"
      });
    }

    if (page.length < BOT_GUILDS_PAGE_SIZE) {
      break;
    }

    const lastId = getLastGuildId(page);
    if (lastId === after) {
      break;
    }
    after = lastId;
  }

  return Array.from(guildsById.values());
}

async function fetchBotGuilds(): Promise<BotGuildsSnapshot> {
  const botToken = getBotToken();

  if (!botToken) {
    throw new DiscordGuildFetchError("missing_bot_token", "Missing DISCORD_BOT_TOKEN.");
  }

  if (botGuildsCache && botGuildsCache.expiresAt > Date.now()) {
    return botGuildsCache;
  }

  if (!botGuildsInFlight) {
    botGuildsInFlight = fetchBotGuildsFromDiscord(botToken)
      .then((guilds) => {
        botGuildsCache = { guilds, ids: new Set(guilds.map((guild) => guild.id)), expiresAt: Date.now() + BOT_GUILD_IDS_CACHE_TTL_MS };
        return botGuildsCache;
      })
      .finally(() => {
        botGuildsInFlight = null;
      });
  }

  return botGuildsInFlight;
}

export async function fetchBotGuildIds(): Promise<Set<string>> {
  return (await fetchBotGuilds()).ids;
}

// Every guild the bot is in, as manageable. Only for the local admin (lib/server/localAdmin.ts), which has no Discord user.
export async function fetchBotDashboardGuilds(): Promise<DashboardGuild[]> {
  const { guilds } = await fetchBotGuilds();
  return guilds.map((guild) => ({ ...guild, owner: false, manageable: true }));
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
