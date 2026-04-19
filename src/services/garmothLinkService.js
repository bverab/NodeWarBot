const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../data/garmoth-links.json');
const dataDirPath = path.dirname(filePath);
const VALID_SYNC_STATUS = new Set(['not_synced', 'success', 'partial', 'failed']);

function ensureStore() {
  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf8');
  }
}

function loadCharacterLinks() {
  ensureStore();
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLink).filter(isPersistableLink);
  } catch (error) {
    console.error('JSON invalido en garmoth-links.json:', error);
    return [];
  }
}

function saveCharacterLinks(links) {
  ensureStore();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(links, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function getCharacterLinkByDiscordUserId(userId) {
  const links = loadCharacterLinks();
  return links.find(entry => entry.discordUserId === String(userId)) || null;
}

function getCharacterLink(discordUserId, guildId) {
  const links = loadCharacterLinks();
  return links.find(entry => isSameScope(entry, discordUserId, guildId)) || null;
}

function getCharacterLinksByGuild(guildId) {
  const links = loadCharacterLinks();
  return links.filter(entry => entry.guildId === String(guildId));
}

function upsertCharacterLink(link, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const normalized = normalizeLink({ ...link, updatedAt: now });
  if (!isPersistableLink(normalized)) {
    throw new Error('Invalid garmoth link payload');
  }

  const links = loadCharacterLinks();
  const index = links.findIndex(entry =>
    isSameScope(entry, normalized.discordUserId, normalized.guildId)
  );

  if (index >= 0) {
    links[index] = {
      ...links[index],
      garmothProfileUrl: normalized.garmothProfileUrl,
      updatedAt: now,
      linkedAt: Number.isFinite(links[index].linkedAt) ? links[index].linkedAt : now
    };
  } else {
    normalized.linkedAt = now;
    normalized.updatedAt = now;
    links.push(normalized);
  }

  saveCharacterLinks(links);
  return index >= 0 ? links[index] : normalized;
}

function updateCharacterLink(discordUserId, guildId, patch = {}, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const links = loadCharacterLinks();
  const index = links.findIndex(entry => isSameScope(entry, discordUserId, guildId));
  if (index < 0) return null;

  const existing = links[index];
  const normalizedPatch = normalizePatch(patch);
  links[index] = normalizeLink({
    ...existing,
    ...normalizedPatch,
    updatedAt: now
  });

  saveCharacterLinks(links);
  return links[index];
}

function removeCharacterLinkByDiscordUserId(userId) {
  const links = loadCharacterLinks();
  const filtered = links.filter(entry => entry.discordUserId !== String(userId));
  if (filtered.length === links.length) return false;
  saveCharacterLinks(filtered);
  return true;
}

function removeCharacterLink(discordUserId, guildId) {
  const links = loadCharacterLinks();
  const filtered = links.filter(entry => !isSameScope(entry, discordUserId, guildId));
  if (filtered.length === links.length) return false;
  saveCharacterLinks(filtered);
  return true;
}

function normalizeLink(link = {}) {
  const normalizedSyncStatus = normalizeSyncStatus(link.syncStatus);
  const hasSyncStatus = normalizedSyncStatus !== null;
  return {
    discordUserId: String(link.discordUserId || ''),
    guildId: link.guildId ? String(link.guildId) : null,
    garmothProfileUrl: String(link.garmothProfileUrl || '').trim(),
    linkedAt: Number.isFinite(link.linkedAt) ? link.linkedAt : Date.now(),
    updatedAt: Number.isFinite(link.updatedAt) ? link.updatedAt : Date.now(),
    characterName: normalizeNullableString(link.characterName),
    classId: normalizeNullableNumber(link.classId),
    className: normalizeNullableString(link.className),
    specRaw: normalizeNullableString(link.specRaw),
    spec: normalizeNullableString(link.spec),
    gearScore: normalizeNullableNumber(link.gearScore),
    lastSyncAt: normalizeNullableNumber(link.lastSyncAt),
    syncStatus: hasSyncStatus ? normalizedSyncStatus : 'not_synced',
    syncErrorMessage: normalizeNullableString(link.syncErrorMessage)
  };
}

function normalizePatch(patch = {}) {
  const normalized = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'garmothProfileUrl')) {
    normalized.garmothProfileUrl = String(patch.garmothProfileUrl || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'characterName')) {
    normalized.characterName = normalizeNullableString(patch.characterName);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'classId')) {
    normalized.classId = normalizeNullableNumber(patch.classId);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'className')) {
    normalized.className = normalizeNullableString(patch.className);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'specRaw')) {
    normalized.specRaw = normalizeNullableString(patch.specRaw);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'spec')) {
    normalized.spec = normalizeNullableString(patch.spec);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'gearScore')) {
    normalized.gearScore = normalizeNullableNumber(patch.gearScore);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'lastSyncAt')) {
    normalized.lastSyncAt = normalizeNullableNumber(patch.lastSyncAt);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'syncStatus')) {
    normalized.syncStatus = normalizeSyncStatus(patch.syncStatus) || 'failed';
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'syncErrorMessage')) {
    normalized.syncErrorMessage = normalizeNullableString(patch.syncErrorMessage);
  }
  return normalized;
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSyncStatus(value) {
  const normalized = normalizeNullableString(value);
  if (!normalized) return null;
  return VALID_SYNC_STATUS.has(normalized) ? normalized : null;
}

function isSameScope(entry, discordUserId, guildId) {
  return entry.discordUserId === String(discordUserId) && entry.guildId === String(guildId);
}

function isPersistableLink(link) {
  return Boolean(link.discordUserId && link.guildId && link.garmothProfileUrl);
}

module.exports = {
  loadCharacterLinks,
  saveCharacterLinks,
  getCharacterLinkByDiscordUserId,
  getCharacterLink,
  getCharacterLinksByGuild,
  upsertCharacterLink,
  updateCharacterLink,
  removeCharacterLinkByDiscordUserId,
  removeCharacterLink
};
