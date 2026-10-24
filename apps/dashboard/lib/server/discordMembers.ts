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

// The event page asks for every participant on each render. Lookups are cached per guild+user and run a few at a time,
// so a big roster neither floods Discord's rate limit (shared with the bot) nor repeats work on every refresh.
const MEMBER_CACHE_TTL_MS = 5 * 60_000;
const MEMBER_FAILURE_TTL_MS = 30_000;
const MEMBER_CACHE_MAX_ENTRIES = 2_000;
const MEMBER_FETCH_CONCURRENCY = 5;

const memberCache = new Map<string, { member: DiscordMemberSummary; expiresAt: number }>();
const memberLookups = new Map<string, Promise<DiscordMemberSummary>>();

function rememberMember(key: string, member: DiscordMemberSummary, ttlMs: number) {
  memberCache.delete(key);
  memberCache.set(key, { member, expiresAt: Date.now() + ttlMs });

  while (memberCache.size > MEMBER_CACHE_MAX_ENTRIES) {
    const oldest = memberCache.keys().next().value;
    if (oldest === undefined) break;
    memberCache.delete(oldest);
  }
}

async function lookupDiscordGuildMember(guildId: string, userId: string, token: string): Promise<{ member: DiscordMemberSummary; ttlMs: number }> {
  try {
    const response = await fetch(`${DISCORD_API_BASE_URL}/guilds/${guildId}/members/${userId}`, {
      headers: {
        Authorization: `Bot ${token}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      console.warn(`Discord member lookup failed for guild ${guildId}, user ${userId}: ${response.status}`);
      // A member that left the guild stays gone; anything else (rate limit, 5xx) is worth retrying soon.
      return { member: fallbackMember(userId), ttlMs: response.status === 404 ? MEMBER_CACHE_TTL_MS : MEMBER_FAILURE_TTL_MS };
    }

    const member = (await response.json()) as DiscordGuildMemberPayload;
    const user = member.user;
    const displayName = member.nick || user?.global_name || user?.username || userId;

    return {
      member: {
        id: userId,
        displayName,
        username: user?.username ?? null,
        avatarUrl:
          buildGuildMemberAvatarUrl(guildId, userId, member.avatar) ??
          buildUserAvatarUrl(userId, user?.avatar)
      },
      ttlMs: MEMBER_CACHE_TTL_MS
    };
  } catch {
    console.warn(`Discord member lookup failed for guild ${guildId}, user ${userId}.`);
    return { member: fallbackMember(userId), ttlMs: MEMBER_FAILURE_TTL_MS };
  }
}

function resolveDiscordGuildMember(guildId: string, userId: string, token: string): Promise<DiscordMemberSummary> {
  const key = `${guildId}:${userId}`;

  const cached = memberCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.member);
  }

  let pending = memberLookups.get(key);
  if (!pending) {
    pending = lookupDiscordGuildMember(guildId, userId, token)
      .then(({ member, ttlMs }) => {
        rememberMember(key, member, ttlMs);
        return member;
      })
      .finally(() => {
        memberLookups.delete(key);
      });
    memberLookups.set(key, pending);
  }

  return pending;
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

  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(MEMBER_FETCH_CONCURRENCY, uniqueUserIds.length) }, async () => {
    while (nextIndex < uniqueUserIds.length) {
      const userId = uniqueUserIds[nextIndex];
      nextIndex += 1;
      members.set(userId, await resolveDiscordGuildMember(guildId, userId, token));
    }
  });
  await Promise.all(workers);

  return members;
}
