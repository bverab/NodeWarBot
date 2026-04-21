const { getCharacterLinksByGuild, loadCharacterLinks } = require('../services/garmothLinkService');
const { getServerClassEmoji } = require('../services/serverClassEmojiService');
const { resolveApplicationEmojiInline, normalizeClassNameToEmojiName } = require('./applicationEmojiResolver');

function createParticipantDisplayFormatter(options = {}) {
  const guildId = options.guildId ? String(options.guildId) : null;
  const classIconSource = normalizeClassIconSource(options.classIconSource);
  const participantDisplayStyle = normalizeParticipantDisplayStyle(options.participantDisplayStyle);
  const client = options.client || global.discordClient || null;
  const garmothByUserId = buildGarmothMap(guildId);

  return participant => formatParticipantDisplay(participant, garmothByUserId, {
    client,
    guildId,
    classIconSource,
    participantDisplayStyle
  });
}

function formatParticipantDisplay(participant, garmothByUserId, iconOptions) {
  const nickname = normalizeNickname(participant?.displayName);
  const style = normalizeParticipantDisplayStyle(iconOptions?.participantDisplayStyle);
  const profile = participant?.userId && !participant?.isFake
    ? garmothByUserId.get(String(participant.userId))
    : null;
  const classEmoji = profile ? resolveClassEmoji(profile.className, iconOptions) : '';
  const gearScore = profile ? normalizeGearScore(profile.gearScore) : null;
  const specShort = profile ? resolveSpecShort(profile.spec) : '';
  const prefix = classEmoji ? `${classEmoji} ` : '';

  if (style === 'classic') {
    return `${prefix}${nickname}`;
  }

  if (style === 'hybrid') {
    return `${prefix}${nickname}`;
  }

  const compact = `${gearScore !== null ? String(gearScore) : ''}${specShort}`;
  const suffix = compact ? ` \u00b7 ${compact}` : '';
  return `${prefix}${nickname}${suffix}`;
}

function resolveClassEmoji(className, iconOptions = {}) {
  const emojiName = normalizeClassNameToEmojiName(className);
  if (!emojiName) return '';

  const source = normalizeClassIconSource(iconOptions.classIconSource);
  const guildEmoji = getServerClassEmoji(iconOptions.guildId, emojiName);
  const botEmoji = resolveApplicationEmojiInline(iconOptions.client, className);

  if (source === 'guild') return guildEmoji;
  return botEmoji;
}

function buildGarmothMap(guildId) {
  const links = guildId ? getCharacterLinksByGuild(guildId) : loadCharacterLinks();
  const map = new Map();

  for (const link of links) {
    const key = String(link.discordUserId || '');
    if (!key) continue;

    const current = map.get(key);
    const currentUpdatedAt = Number.isFinite(current?.updatedAt) ? current.updatedAt : 0;
    const incomingUpdatedAt = Number.isFinite(link?.updatedAt) ? link.updatedAt : 0;
    if (!current || incomingUpdatedAt >= currentUpdatedAt) {
      map.set(key, link);
    }
  }

  return map;
}

function resolveSpecShort(spec) {
  if (spec === 'Awakening') return 'A';
  if (spec === 'Succession') return 'S';
  return '';
}

function normalizeGearScore(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeNickname(value) {
  const text = normalizeText(value);
  return text || 'Usuario';
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  const normalized = String(value).trim();
  return normalized || '';
}

function normalizeClassIconSource(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'guild') return 'guild';
  return 'bot';
}

function normalizeParticipantDisplayStyle(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'classic') return 'classic';
  if (normalized === 'hybrid') return 'hybrid';
  return 'modern';
}

module.exports = {
  createParticipantDisplayFormatter,
  resolveSpecShort,
  normalizeClassIconSource,
  normalizeParticipantDisplayStyle
};
