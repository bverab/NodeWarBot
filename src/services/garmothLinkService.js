const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../data/garmoth-links.json');
const dataDirPath = path.dirname(filePath);

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
  return {
    discordUserId: String(link.discordUserId || ''),
    guildId: link.guildId ? String(link.guildId) : null,
    garmothProfileUrl: String(link.garmothProfileUrl || '').trim(),
    linkedAt: Number.isFinite(link.linkedAt) ? link.linkedAt : Date.now(),
    updatedAt: Number.isFinite(link.updatedAt) ? link.updatedAt : Date.now()
  };
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
  upsertCharacterLink,
  removeCharacterLinkByDiscordUserId,
  removeCharacterLink
};
