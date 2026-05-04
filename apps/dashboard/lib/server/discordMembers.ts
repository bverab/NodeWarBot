import "server-only";

type DiscordUserPayload = {
  id: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
};

type DiscordGuildMemberPayload = {
  nick?: string | null;
  avatar?: string | null;
  user?: DiscordUserPayload;
};

export type DiscordMemberSummary = {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";

function getBotToken() {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.TOKEN;
  return token?.replace(/^Bot\s+/i, "");
}

function getAvatarExtension(hash: string) {
  return hash.startsWith("a_") ? "gif" : "png";
}

function buildGuildMemberAvatarUrl(guildId: string, userId: string, avatar: string | null | undefined) {
  if (!avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${avatar}.${getAvatarExtension(avatar)}?size=64`;
}

function buildUserAvatarUrl(userId: string, avatar: string | null | undefined) {
  if (!avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${getAvatarExtension(avatar)}?size=64`;
}

function fallbackMember(userId: string): DiscordMemberSummary {
  return {
    id: userId,
    displayName: userId,
    username: null,
    avatarUrl: null
  };
}

async function fetchDiscordGuildMember(guildId: string, userId: string, token: string): Promise<DiscordMemberSummary> {
  const response = await fetch(`${DISCORD_API_BASE_URL}/guilds/${guildId}/members/${userId}`, {
    headers: {
      Authorization: `Bot ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    console.warn(`Discord member lookup failed for guild ${guildId}, user ${userId}: ${response.status}`);
    return fallbackMember(userId);
  }

  const member = (await response.json()) as DiscordGuildMemberPayload;
  const user = member.user;
  const displayName = member.nick || user?.global_name || user?.username || userId;

  return {
    id: userId,
    displayName,
    username: user?.username ?? null,
    avatarUrl:
      buildGuildMemberAvatarUrl(guildId, userId, member.avatar) ??
      buildUserAvatarUrl(userId, user?.avatar)
  };
}

export async function fetchDiscordGuildMembers(
  guildId: string,
  userIds: string[]
): Promise<Map<string, DiscordMemberSummary>> {
  const uniqueUserIds = Array.from(new Set(userIds.map(String).filter(Boolean)));
  const members = new Map<string, DiscordMemberSummary>();

  for (const userId of uniqueUserIds) {
    members.set(userId, fallbackMember(userId));
  }

  const token = getBotToken();
  if (!token || uniqueUserIds.length === 0) {
    if (!token) {
      console.warn("DISCORD_BOT_TOKEN is not configured. Garmoth Discord member enrichment is using fallbacks.");
    }
    return members;
  }

  const results = await Promise.allSettled(
    uniqueUserIds.map((userId) => fetchDiscordGuildMember(guildId, userId, token))
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      members.set(result.value.id, result.value);
    }
  }

  return members;
}
