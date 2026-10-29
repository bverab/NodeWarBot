import "server-only";
import { isDiscordSnowflake } from "../discordSnowflake";
import { summarizeGuildMember, type DiscordGuildMemberPayload } from "./discordMembers";
import {
  PERMISSIONS,
  computeChannelPermissions,
  discordFetch,
  hasAllPermissions,
  type DiscordChannelPayload,
  type DiscordRolePayload
} from "./discordRestEventAdapter";

// People for a PvE "By people" access list: real members (no bots) who can see the channel the event is posted in.
// Member search does not need the privileged GUILD_MEMBERS intent; listing every member would.
const SEARCH_LIMIT = 25;

export type ChannelMemberCandidate = {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  canViewChannel: boolean;
};

type ChannelAccessContext = { channel: DiscordChannelPayload; roles: DiscordRolePayload[] } | null;

async function loadChannelAccess(guildId: string, channelId: string | null | undefined): Promise<ChannelAccessContext> {
  if (!channelId || !isDiscordSnowflake(channelId)) {
    return null;
  }

  const [channel, roles] = await Promise.all([
    discordFetch<DiscordChannelPayload>(`/channels/${channelId}`),
    discordFetch<DiscordRolePayload[]>(`/guilds/${guildId}/roles`)
  ]);
  return channel.guild_id === guildId ? { channel, roles } : null;
}

function canViewChannel(guildId: string, context: ChannelAccessContext, userId: string, member: DiscordGuildMemberPayload) {
  if (!context) {
    return true;
  }
  const permissions = computeChannelPermissions(guildId, context.roles, { user: { id: userId }, roles: member.roles ?? [] }, context.channel);
  return hasAllPermissions(permissions, [PERMISSIONS.ViewChannel]);
}

async function fetchMember(guildId: string, userId: string) {
  if (!isDiscordSnowflake(userId)) {
    return null;
  }
  return await discordFetch<DiscordGuildMemberPayload>(`/guilds/${guildId}/members/${userId}`).catch(() => null);
}

export async function searchChannelMembers(guildId: string, query: string, channelId?: string | null): Promise<ChannelMemberCandidate[]> {
  const search = new URLSearchParams({ query, limit: String(SEARCH_LIMIT) });
  const [found, context] = await Promise.all([
    discordFetch<DiscordGuildMemberPayload[]>(`/guilds/${guildId}/members/search?${search.toString()}`),
    loadChannelAccess(guildId, channelId)
  ]);

  return found
    .filter((member) => member.user?.id && !member.user.bot)
    .map((member) => {
      const userId = member.user?.id as string;
      return { ...summarizeGuildMember(guildId, userId, member), canViewChannel: canViewChannel(guildId, context, userId, member) };
    });
}

// Splits the chosen people into those who can be on the list and those who cannot (left the guild, bots, or cannot
// see the channel). Without a channel only membership is checked.
export async function validateAccessUsers(guildId: string, userIds: string[], channelId?: string | null) {
  const context = await loadChannelAccess(guildId, channelId);
  const allowed: string[] = [];
  const rejected: string[] = [];

  for (const userId of Array.from(new Set(userIds.map(String)))) {
    const member = await fetchMember(guildId, userId);
    if (member && !member.user?.bot && canViewChannel(guildId, context, userId, member)) {
      allowed.push(userId);
    } else {
      rejected.push(userId);
    }
  }

  return { allowed, rejected };
}

// Current roles of a member, used to re-check fillers when an event is restricted by roles.
export async function fetchMemberRoleIds(guildId: string, userId: string) {
  const member = await fetchMember(guildId, userId);
  return member?.roles ?? [];
}
