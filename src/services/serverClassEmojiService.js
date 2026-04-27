const fs = require('fs');
const path = require('path');
const { logWarn } = require('../utils/appLogger');

const filePath = path.join(__dirname, '../../data/server-class-emojis.json');
const CACHE_TTL_MS = 60 * 1000;
const INLINE_EMOJI_REGEX = /^<a?:[A-Za-z0-9_]{2,}:\d+>$/;

let cachedAt = 0;
let cachedData = {};

function getServerClassEmoji(guildId, emojiName) {
  if (!guildId || !emojiName) return '';

  const data = loadServerEmojiConfig();
  const guildMap = data[String(guildId)];
  if (!guildMap || typeof guildMap !== 'object') return '';

  const value = guildMap[String(emojiName)];
  if (!value) return '';

  if (typeof value === 'string') {
    const normalized = value.trim();
    return INLINE_EMOJI_REGEX.test(normalized) ? normalized : '';
  }

  if (typeof value === 'object' && value.id && value.name) {
    const animated = value.animated ? 'a' : '';
    return `<${animated}:${value.name}:${value.id}>`;
  }

  return '';
}

function hasGuildServerEmojiConfig(guildId) {
  if (!guildId) return false;
  const data = loadServerEmojiConfig();
  const guildMap = data[String(guildId)];
  return Boolean(guildMap && typeof guildMap === 'object' && Object.keys(guildMap).length > 0);
}

function loadServerEmojiConfig() {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) return cachedData;

  cachedAt = now;
  cachedData = readConfigFile();
  return cachedData;
}

function readConfigFile() {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch (error) {
    logWarn('No se pudo leer server-class-emojis.json', {
      action: 'load_server_class_emoji_config',
      filePath,
      reason: error?.message || 'unknown'
    });
    return {};
  }
}

function normalizeConfig(parsed) {
  if (!parsed || typeof parsed !== 'object') return {};
  if (Array.isArray(parsed)) {
    const asMap = {};
    for (const item of parsed) {
      if (!item?.guildId || !item?.classEmojis || typeof item.classEmojis !== 'object') continue;
      asMap[String(item.guildId)] = item.classEmojis;
    }
    return asMap;
  }
  return parsed;
}

module.exports = {
  getServerClassEmoji,
  hasGuildServerEmojiConfig
};
