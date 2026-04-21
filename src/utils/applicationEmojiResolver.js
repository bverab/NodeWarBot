const EMOJI_CACHE_TTL_MS = 5 * 60 * 1000;
const EMOJI_RETRY_MS = 30 * 1000;

const cacheByClientId = new Map();

function resolveApplicationEmojiInline(client, className) {
  const emojiName = normalizeClassNameToEmojiName(className);
  if (!emojiName) return '';

  const state = getOrCreateCacheState(client);
  if (!state) return '';

  maybeRefreshEmojiCache(client, state);

  const directMatch = state.byName.get(emojiName);
  if (directMatch) return toInlineEmoji(directMatch);

  const caseInsensitiveMatch = state.byNameLower.get(emojiName.toLowerCase());
  return caseInsensitiveMatch ? toInlineEmoji(caseInsensitiveMatch) : '';
}

async function primeApplicationEmojiCache(client) {
  const state = getOrCreateCacheState(client);
  if (!state) return false;

  try {
    await refreshEmojiCache(client, state);
    return true;
  } catch (error) {
    state.lastFailedAt = Date.now();
    return false;
  }
}

function normalizeClassNameToEmojiName(className) {
  const raw = String(className || '').trim();
  if (!raw) return '';

  const tokens = raw
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .map(toTitleToken);

  return tokens.join('_');
}

function toTitleToken(token) {
  const text = String(token || '').trim();
  if (!text) return '';

  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function getOrCreateCacheState(client) {
  const clientId = String(client?.user?.id || '');
  if (!clientId) return null;

  if (!cacheByClientId.has(clientId)) {
    cacheByClientId.set(clientId, {
      byName: new Map(),
      byNameLower: new Map(),
      inFlight: null,
      lastFetchedAt: 0,
      lastFailedAt: 0
    });
  }

  return cacheByClientId.get(clientId);
}

function maybeRefreshEmojiCache(client, state) {
  const now = Date.now();
  if (state.inFlight) return;
  if (state.lastFetchedAt > 0 && now - state.lastFetchedAt < EMOJI_CACHE_TTL_MS) return;
  if (state.lastFailedAt > 0 && now - state.lastFailedAt < EMOJI_RETRY_MS) return;

  state.inFlight = refreshEmojiCache(client, state)
    .catch(() => {
      state.lastFailedAt = Date.now();
    })
    .finally(() => {
      state.inFlight = null;
    });
}

async function refreshEmojiCache(client, state) {
  if (!client?.application?.emojis?.fetch) return;

  try {
    await client.application.fetch();
  } catch (error) {
    // Ignorar: si no se puede refrescar metadata de app, se intenta fetch igual.
  }

  const emojis = await client.application.emojis.fetch();
  const byName = new Map();
  const byNameLower = new Map();

  for (const emoji of emojis.values()) {
    if (!emoji?.name || !emoji?.id) continue;
    byName.set(emoji.name, emoji);
    byNameLower.set(emoji.name.toLowerCase(), emoji);
  }

  state.byName = byName;
  state.byNameLower = byNameLower;
  state.lastFetchedAt = Date.now();
  state.lastFailedAt = 0;
}

function toInlineEmoji(emoji) {
  const animated = emoji.animated ? 'a' : '';
  return `<${animated}:${emoji.name}:${emoji.id}>`;
}

module.exports = {
  resolveApplicationEmojiInline,
  normalizeClassNameToEmojiName,
  primeApplicationEmojiCache
};
