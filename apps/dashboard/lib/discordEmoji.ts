export type ParsedDiscordEmoji = {
  id: string;
  name: string;
  animated: boolean;
  imageUrl: string;
  raw: string;
};

const DISCORD_CUSTOM_EMOJI_PATTERN = /^<(?<animated>a?):(?<name>[A-Za-z0-9_~]+):(?<id>\d+)>$/;

export function parseDiscordEmoji(value: string | null | undefined): ParsedDiscordEmoji | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(DISCORD_CUSTOM_EMOJI_PATTERN);
  const groups = match?.groups;

  if (!groups?.id || !groups.name) {
    return null;
  }

  const animated = groups.animated === "a";

  return {
    id: groups.id,
    name: groups.name,
    animated,
    imageUrl: `https://cdn.discordapp.com/emojis/${groups.id}.${animated ? "gif" : "png"}`,
    raw: value
  };
}
