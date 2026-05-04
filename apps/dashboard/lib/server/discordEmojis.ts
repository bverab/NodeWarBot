import "server-only";

export type DiscordEmojiSummary = {
  id: string;
  name: string;
  animated: boolean;
  url: string;
  source: "guild" | "application";
  raw: string;
  syntax: string;
};

type DiscordEmojiPayload = {
  id: string;
  name: string;
  animated?: boolean;
};

type DiscordEmojiResponse = DiscordEmojiPayload[] | { items?: DiscordEmojiPayload[] };

const DISCORD_API = "https://discord.com/api/v10";

function getToken() {
  return (process.env.DISCORD_BOT_TOKEN || process.env.TOKEN)?.replace(/^Bot\s+/i, "");
}

function toSummary(emoji: DiscordEmojiPayload, source: DiscordEmojiSummary["source"]): DiscordEmojiSummary {
  const extension = emoji.animated ? "gif" : "png";

  const syntax = `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;

  return {
    id: emoji.id,
    name: emoji.name,
    animated: Boolean(emoji.animated),
    url: `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}?size=48&quality=lossless`,
    source,
    raw: syntax,
    syntax
  };
}

async function fetchDiscordEmojis(url: string, source: DiscordEmojiSummary["source"]) {
  const token = getToken();
  if (!token) {
    return [];
  }

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
      next: { revalidate: 60 }
    });

    if (!response.ok) {
      console.warn(`Discord emoji lookup failed with status ${response.status}.`);
      return [];
    }

    const data = (await response.json()) as DiscordEmojiResponse;
    const emojis = Array.isArray(data) ? data : data.items ?? [];
    return emojis.map((emoji) => toSummary(emoji, source));
  } catch {
    console.warn("Discord emoji lookup failed.");
    return [];
  }
}

export function getApplicationId() {
  return (
    process.env.DISCORD_APPLICATION_ID ||
    process.env.DISCORD_CLIENT_ID ||
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ||
    process.env.CLIENT_ID ||
    null
  );
}

export async function getGuildEmojis(guildId: string) {
  return fetchDiscordEmojis(`${DISCORD_API}/guilds/${guildId}/emojis`, "guild");
}

export async function getApplicationEmojis() {
  const applicationId = getApplicationId();

  if (!applicationId) {
    return [];
  }

  return fetchDiscordEmojis(`${DISCORD_API}/applications/${applicationId}/emojis`, "application");
}
