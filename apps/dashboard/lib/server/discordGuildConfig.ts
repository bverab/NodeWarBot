import "server-only";

const DISCORD_API = "https://discord.com/api/v10";

type DiscordRolePayload = {
  id: string;
  name: string;
  color?: number;
  position?: number;
  managed?: boolean;
};

type DiscordChannelPayload = {
  id: string;
  name: string;
  type: number;
  position?: number;
  parent_id?: string | null;
  guild_id?: string;
};

export type DiscordRoleSummary = {
  id: string;
  name: string;
  color: number | null;
  position: number;
  managed: boolean;
};

export type DiscordChannelSummary = {
  id: string;
  name: string;
  type: number;
  position: number;
  parentId: string | null;
};

function getToken() {
  return (process.env.DISCORD_BOT_TOKEN || process.env.TOKEN)?.replace(/^Bot\s+/i, "");
}

async function fetchDiscord<T>(path: string): Promise<T | null> {
  const token = getToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${token}` },
      next: { revalidate: 60 }
    });

    if (!response.ok) {
      console.warn(`Discord guild config lookup failed for ${path}: ${response.status}`);
      return null;
    }

    return (await response.json()) as T;
  } catch {
    console.warn(`Discord guild config lookup failed for ${path}.`);
    return null;
  }
}

export async function getGuildRoles(guildId: string): Promise<DiscordRoleSummary[]> {
  const roles = await fetchDiscord<DiscordRolePayload[]>(`/guilds/${guildId}/roles`);

  return (roles ?? [])
    .filter((role) => role.name !== "@everyone")
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: typeof role.color === "number" ? role.color : null,
      position: typeof role.position === "number" ? role.position : 0,
      managed: Boolean(role.managed)
    }))
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
}

export async function getGuildPostChannels(guildId: string): Promise<DiscordChannelSummary[]> {
  const channels = await fetchDiscord<DiscordChannelPayload[]>(`/guilds/${guildId}/channels`);
  const postableTypes = new Set([0, 5, 15]);

  return (channels ?? [])
    .filter((channel) => postableTypes.has(channel.type))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: typeof channel.position === "number" ? channel.position : 0,
      parentId: channel.parent_id ?? null
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export async function getGuildPostChannelById(guildId: string, channelId: string): Promise<DiscordChannelSummary | null> {
  const channel = await fetchDiscord<DiscordChannelPayload>(`/channels/${channelId}`);
  const postableTypes = new Set([0, 5, 15]);

  if (!channel || channel.guild_id !== guildId || !postableTypes.has(channel.type)) {
    return null;
  }

  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    position: typeof channel.position === "number" ? channel.position : 0,
    parentId: channel.parent_id ?? null
  };
}
