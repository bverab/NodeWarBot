export type ChannelSearchable = {
  displayName?: string | null;
  id?: string | null;
  label?: string | null;
  name?: string | null;
};

const DECORATIVE_LATIN: Record<string, string> = {
  "ᴀ": "a",
  "ʙ": "b",
  "ᴄ": "c",
  "ᴅ": "d",
  "ᴇ": "e",
  "ꜰ": "f",
  "ɢ": "g",
  "ʜ": "h",
  "ɪ": "i",
  "ᴊ": "j",
  "ᴋ": "k",
  "ʟ": "l",
  "ᴍ": "m",
  "ɴ": "n",
  "ᴏ": "o",
  "ᴘ": "p",
  "ǫ": "q",
  "ʀ": "r",
  "ꜱ": "s",
  "ᴛ": "t",
  "ᴜ": "u",
  "ᴠ": "v",
  "ᴡ": "w",
  "x": "x",
  "ʏ": "y",
  "ᴢ": "z"
};

function replaceDecorativeLatin(input: string) {
  return Array.from(input, (character) => DECORATIVE_LATIN[character] ?? character).join("");
}

export function normalizeSearchText(input: string) {
  return replaceDecorativeLatin(input)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(input: string) {
  return input.replace(/\s+/g, "");
}

function isSubsequence(candidate: string, query: string) {
  if (!query) {
    return true;
  }

  let queryIndex = 0;

  for (const character of candidate) {
    if (character === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return true;
      }
    }
  }

  return false;
}

export function getChannelSearchText(channel: ChannelSearchable) {
  return normalizeSearchText(
    [channel.name, channel.label, channel.displayName, channel.id]
      .filter((value): value is string => Boolean(value))
      .join(" ")
  );
}

function getChannelSearchCandidates(channel: ChannelSearchable) {
  const values = [channel.name, channel.label, channel.displayName, channel.id]
    .filter((value): value is string => Boolean(value));
  return [...values, values.join(" ")];
}

export function rankSearchMatch(candidate: string, query: string): number | null {
  const normalizedCandidate = normalizeSearchText(candidate);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return 0;
  }

  const compactCandidate = compactSearchText(normalizedCandidate);
  const compactQuery = compactSearchText(normalizedQuery);

  if (normalizedCandidate === normalizedQuery || compactCandidate === compactQuery) {
    return 0;
  }

  if (normalizedCandidate.startsWith(normalizedQuery) || compactCandidate.startsWith(compactQuery)) {
    return 1;
  }

  if (normalizedCandidate.includes(normalizedQuery) || compactCandidate.includes(compactQuery)) {
    return 2;
  }

  if (isSubsequence(compactCandidate, compactQuery)) {
    return 3;
  }

  return null;
}

export function filterChannelsBySearch<T extends ChannelSearchable>(channels: T[], query: string) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return channels;
  }

  return channels
    .map((channel) => {
      const ranks = getChannelSearchCandidates(channel)
        .map((candidate) => rankSearchMatch(candidate, normalizedQuery))
        .filter((rank): rank is number => rank !== null);
      const rank = ranks.length ? Math.min(...ranks) : null;
      return rank === null ? null : { channel, rank };
    })
    .filter((item): item is { channel: T; rank: number } => Boolean(item))
    .sort((a, b) => a.rank - b.rank || (a.channel.name ?? "").localeCompare(b.channel.name ?? ""))
    .map((item) => item.channel);
}
