import "server-only";

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";

const PERMISSIONS = {
  Administrator: 0x8n,
  ViewChannel: 0x400n,
  SendMessages: 0x800n,
  EmbedLinks: 0x4000n,
  ReadMessageHistory: 0x10000n
};

type DiscordChannelPayload = {
  id: string;
  guild_id?: string;
  type: number;
  permission_overwrites?: Array<{
    id: string;
    type: number;
    allow: string;
    deny: string;
  }>;
};

type DiscordRolePayload = {
  id: string;
  permissions: string;
};

type DiscordMemberPayload = {
  user?: { id: string };
  roles: string[];
};

type DiscordUserPayload = {
  id: string;
};

type DiscordRestError = Error & {
  code?: number;
  status?: number;
  rawError?: { code?: number; message?: string };
};

export type DiscordPermissionCheckResult =
  | { ok: true; channel: DiscordChannelPayload }
  | { ok: false; status: number; error: string; errorCode?: string };

function getBotToken() {
  return (process.env.DISCORD_BOT_TOKEN || process.env.TOKEN)?.replace(/^Bot\s+/i, "");
}

async function discordFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getBotToken();
  if (!token) {
    throw Object.assign(new Error("Missing Discord bot token."), { code: "MISSING_BOT_TOKEN" });
  }

  const response = await fetch(`${DISCORD_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const raw = (await response.json().catch(() => null)) as { code?: number; message?: string } | null;
    const error = new Error(raw?.message || `Discord REST request failed with status ${response.status}.`) as DiscordRestError;
    error.status = response.status;
    error.code = raw?.code || response.status;
    error.rawError = raw || undefined;
    throw error;
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

function toPermissionBits(value: string | number | bigint | null | undefined) {
  try {
    return BigInt(value ?? 0);
  } catch {
    return 0n;
  }
}

function hasAllPermissions(permissions: bigint, required: bigint[]) {
  if ((permissions & PERMISSIONS.Administrator) === PERMISSIONS.Administrator) {
    return true;
  }
  return required.every((permission) => (permissions & permission) === permission);
}

function applyOverwrite(base: bigint, allow: bigint, deny: bigint) {
  return (base & ~deny) | allow;
}

function computeChannelPermissions(
  guildId: string,
  roles: DiscordRolePayload[],
  member: DiscordMemberPayload,
  channel: DiscordChannelPayload
) {
  const roleById = new Map(roles.map((role) => [role.id, toPermissionBits(role.permissions)]));
  let permissions = roleById.get(guildId) ?? 0n;

  for (const roleId of member.roles) {
    permissions |= roleById.get(roleId) ?? 0n;
  }

  if ((permissions & PERMISSIONS.Administrator) === PERMISSIONS.Administrator) {
    return permissions;
  }

  const overwrites = channel.permission_overwrites ?? [];
  const everyone = overwrites.find((overwrite) => overwrite.type === 0 && overwrite.id === guildId);
  if (everyone) {
    permissions = applyOverwrite(permissions, toPermissionBits(everyone.allow), toPermissionBits(everyone.deny));
  }

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type !== 0 || !member.roles.includes(overwrite.id)) continue;
    roleAllow |= toPermissionBits(overwrite.allow);
    roleDeny |= toPermissionBits(overwrite.deny);
  }
  permissions = applyOverwrite(permissions, roleAllow, roleDeny);

  const memberOverwrite = overwrites.find((overwrite) => overwrite.type === 1 && overwrite.id === member.user?.id);
  if (memberOverwrite) {
    permissions = applyOverwrite(permissions, toPermissionBits(memberOverwrite.allow), toPermissionBits(memberOverwrite.deny));
  }

  return permissions;
}

function serializeDiscordPayload(payload: unknown) {
  return JSON.parse(JSON.stringify(payload)) as unknown;
}

export async function validateBotCanPublishToChannel(guildId: string, channelId: string): Promise<DiscordPermissionCheckResult> {
  try {
    const [channel, roles, botUser] = await Promise.all([
      discordFetch<DiscordChannelPayload>(`/channels/${channelId}`),
      discordFetch<DiscordRolePayload[]>(`/guilds/${guildId}/roles`),
      discordFetch<DiscordUserPayload>("/users/@me")
    ]);

    if (channel.guild_id !== guildId) {
      return { ok: false, status: 404, error: "Discord channel was not found for this guild." };
    }

    if (!new Set([0, 5]).has(channel.type)) {
      return { ok: false, status: 400, error: "Publish currently supports text and announcement channels only." };
    }

    const member = await discordFetch<DiscordMemberPayload>(`/guilds/${guildId}/members/${botUser.id}`);
    const permissions = computeChannelPermissions(guildId, roles, member, channel);
    const required = [
      PERMISSIONS.ViewChannel,
      PERMISSIONS.SendMessages,
      PERMISSIONS.EmbedLinks,
      PERMISSIONS.ReadMessageHistory
    ];

    if (!hasAllPermissions(permissions, required)) {
      return {
        ok: false,
        status: 403,
        error: "Spectre does not have View Channel, Send Messages, Embed Links, and Read Message History in that channel."
      };
    }

    return { ok: true, channel };
  } catch (error) {
    const restError = error as DiscordRestError;
    const status = restError.status === 404 || restError.code === 10003 ? 404 : restError.status || 502;
    return {
      ok: false,
      status,
      error: restError.rawError?.message || restError.message || "Discord REST request failed.",
      errorCode: restError.code ? String(restError.code) : undefined
    };
  }
}

export function createDiscordRestGuildAdapter(guildId: string) {
  return {
    channels: {
      async fetch(channelId: string) {
        const validation = await validateBotCanPublishToChannel(guildId, channelId);
        if (!validation.ok) {
          const error = new Error(validation.error) as DiscordRestError;
          error.code = validation.errorCode ? Number(validation.errorCode) : validation.status;
          error.status = validation.status;
          error.rawError = { code: error.code, message: validation.error };
          throw error;
        }

        return {
          id: validation.channel.id,
          messages: {
            fetch: async (messageId: string) => {
              const message = await discordFetch<{ id: string }>(`/channels/${channelId}/messages/${messageId}`);
              return {
                id: message.id,
                edit: async (payload: unknown) => {
                  return discordFetch<{ id: string }>(`/channels/${channelId}/messages/${messageId}`, {
                    method: "PATCH",
                    body: JSON.stringify(serializeDiscordPayload(payload))
                  });
                },
                delete: async () => {
                  return discordFetch<Record<string, never>>(`/channels/${channelId}/messages/${messageId}`, {
                    method: "DELETE"
                  });
                }
              };
            }
          },
          send: async (payload: unknown) => {
            return discordFetch<{ id: string }>(`/channels/${channelId}/messages`, {
              method: "POST",
              body: JSON.stringify(serializeDiscordPayload(payload))
            });
          }
        };
      }
    }
  };
}

export async function deleteDiscordMessageByRest(channelId: string, messageId: string) {
  await discordFetch<Record<string, never>>(`/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE"
  });
}
