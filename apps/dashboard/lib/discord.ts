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

export async function fetchUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const response = await fetch(`${DISCORD_API_BASE_URL}/users/@me/guilds`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Discord guild API request failed with status ${response.status}.`);
  }

  const guilds = (await response.json()) as DiscordGuild[];
  return guilds.map((guild) => ({
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
    throw new Error("Missing DISCORD_BOT_TOKEN.");
  }

  const response = await fetch(`${DISCORD_API_BASE_URL}/users/@me/guilds`, {
    headers: {
      Authorization: `Bot ${botToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Discord bot guild API request failed with status ${response.status}.`);
  }

  const guilds = (await response.json()) as Array<Pick<DiscordGuild, "id">>;
  return new Set(guilds.map((guild) => guild.id));
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
