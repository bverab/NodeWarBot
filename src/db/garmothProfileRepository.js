const { prisma } = require('./client');
const { logInfo } = require('./logger');

const VALID_SYNC_STATUS = new Set(['not_synced', 'success', 'partial', 'failed']);

let linksCache = [];
let initialized = false;
let globalWriteLock = Promise.resolve();
const linkLocks = new Map();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toDate(ms) {
  const timestamp = Number(ms);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date();
}

function toNumber(date) {
  if (!date) return null;
  const parsed = date instanceof Date ? date.getTime() : Number(date);
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizeLinksInput(links) {
  if (!Array.isArray(links)) return [];
  return links
    .map(normalizeLink)
    .filter(entry => Boolean(entry.discordUserId && entry.guildId && entry.garmothProfileUrl));
}

function isSameScope(entry, discordUserId, guildId) {
  return entry.discordUserId === String(discordUserId) && entry.guildId === String(guildId);
}

function toScopeKey(discordUserId, guildId) {
  return `${String(guildId)}:${String(discordUserId)}`;
}

function mapDbToDomain(entry) {
  return normalizeLink({
    discordUserId: entry.discordUserId,
    guildId: entry.guildId,
    garmothProfileUrl: entry.garmothProfileUrl,
    linkedAt: toNumber(entry.linkedAt),
    updatedAt: toNumber(entry.updatedAt),
    characterName: entry.characterName,
    classId: entry.classId,
    className: entry.className,
    specRaw: entry.specRaw,
    spec: entry.spec,
    gearScore: entry.gearScore,
    lastSyncAt: toNumber(entry.lastSyncAt),
    syncStatus: entry.syncStatus,
    syncErrorMessage: entry.syncErrorMessage
  });
}

async function readGarmothProfilesFromSqlite() {
  const rows = await prisma.garmothProfile.findMany({
    orderBy: { updatedAt: 'desc' }
  });
  return rows.map(mapDbToDomain);
}

async function ensureGuildIfNeeded(tx, guildId) {
  if (!guildId) return;
  await tx.guild.upsert({
    where: { id: String(guildId) },
    update: {},
    create: { id: String(guildId) }
  });
}

async function upsertLinkTx(tx, linkInput) {
  const link = normalizeLink(linkInput);
  if (!link.discordUserId || !link.guildId || !link.garmothProfileUrl) return;
  await ensureGuildIfNeeded(tx, link.guildId);
  await tx.garmothProfile.upsert({
    where: {
      guildId_discordUserId: {
        guildId: link.guildId,
        discordUserId: link.discordUserId
      }
    },
    create: {
      guildId: link.guildId,
      discordUserId: link.discordUserId,
      garmothProfileUrl: link.garmothProfileUrl,
      linkedAt: toDate(link.linkedAt),
      updatedAt: toDate(link.updatedAt),
      characterName: link.characterName,
      classId: link.classId,
      className: link.className,
      specRaw: link.specRaw,
      spec: link.spec,
      gearScore: link.gearScore,
      lastSyncAt: link.lastSyncAt ? toDate(link.lastSyncAt) : null,
      syncStatus: link.syncStatus,
      syncErrorMessage: link.syncErrorMessage
    },
    update: {
      garmothProfileUrl: link.garmothProfileUrl,
      linkedAt: toDate(link.linkedAt),
      updatedAt: toDate(link.updatedAt),
      characterName: link.characterName,
      classId: link.classId,
      className: link.className,
      specRaw: link.specRaw,
      spec: link.spec,
      gearScore: link.gearScore,
      lastSyncAt: link.lastSyncAt ? toDate(link.lastSyncAt) : null,
      syncStatus: link.syncStatus,
      syncErrorMessage: link.syncErrorMessage
    }
  });
}

async function replaceAllGarmothProfilesInSqlite(linksInput) {
  const links = normalizeLinksInput(linksInput);
  await prisma.$transaction(async tx => {
    await tx.garmothProfile.deleteMany();
    for (const link of links) {
      await upsertLinkTx(tx, link);
    }
  });
}

async function persistLinkToSqlite(linkInput) {
  await prisma.$transaction(async tx => {
    await upsertLinkTx(tx, linkInput);
  });
}

async function removeLinkFromSqlite(discordUserId, guildId) {
  await prisma.garmothProfile.deleteMany({
    where: {
      discordUserId: String(discordUserId),
      guildId: String(guildId)
    }
  });
}

function withGlobalWriteLock(task) {
  const next = globalWriteLock.then(task);
  globalWriteLock = next.catch(() => null);
  return next;
}

function withLinkLock(discordUserId, guildId, task) {
  const key = toScopeKey(discordUserId, guildId);
  const previous = linkLocks.get(key) || Promise.resolve();
  const guard = previous.catch(() => null);
  const next = guard.then(task);
  linkLocks.set(key, next);
  return next.finally(() => {
    if (linkLocks.get(key) === next) {
      linkLocks.delete(key);
    }
  });
}

async function initializeGarmothProfileRepository() {
  if (initialized) return;
  linksCache = normalizeLinksInput(await readGarmothProfilesFromSqlite());
  initialized = true;
  logInfo(`GarmothProfileRepository inicializado con ${linksCache.length} link(s).`);
}

function loadCharacterLinks() {
  return deepClone(linksCache);
}

async function saveCharacterLinks(links) {
  const normalized = normalizeLinksInput(links);
  await withGlobalWriteLock(async () => {
    await replaceAllGarmothProfilesInSqlite(normalized);
    linksCache = normalized;
  });
}

function getCharacterLinkByDiscordUserId(userId) {
  return loadCharacterLinks().find(entry => entry.discordUserId === String(userId)) || null;
}

function getCharacterLink(discordUserId, guildId) {
  return loadCharacterLinks().find(entry => isSameScope(entry, discordUserId, guildId)) || null;
}

function getCharacterLinksByGuild(guildId) {
  return loadCharacterLinks().filter(entry => entry.guildId === String(guildId));
}

async function upsertCharacterLink(link, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const normalized = normalizeLink({ ...link, updatedAt: now });
  if (!normalized.discordUserId || !normalized.guildId || !normalized.garmothProfileUrl) {
    throw new Error('Invalid garmoth link payload');
  }

  await withLinkLock(normalized.discordUserId, normalized.guildId, async () => {
    const existing = linksCache.find(entry => isSameScope(entry, normalized.discordUserId, normalized.guildId));
    const next = existing
      ? normalizeLink({
          ...existing,
          garmothProfileUrl: normalized.garmothProfileUrl,
          updatedAt: now,
          linkedAt: Number.isFinite(existing.linkedAt) ? existing.linkedAt : now
        })
      : normalizeLink({
          ...normalized,
          linkedAt: now,
          updatedAt: now
        });

    await persistLinkToSqlite(next);

    const index = linksCache.findIndex(entry => isSameScope(entry, next.discordUserId, next.guildId));
    if (index >= 0) linksCache[index] = next;
    else linksCache.push(next);
  });

  return getCharacterLink(normalized.discordUserId, normalized.guildId);
}

async function updateCharacterLink(discordUserId, guildId, patch = {}, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  let updated = null;
  await withLinkLock(discordUserId, guildId, async () => {
    const current = linksCache.find(entry => isSameScope(entry, discordUserId, guildId));
    if (!current) return;

    updated = normalizeLink({
      ...current,
      ...patch,
      updatedAt: now
    });
    await persistLinkToSqlite(updated);
    const index = linksCache.findIndex(entry => isSameScope(entry, updated.discordUserId, updated.guildId));
    if (index >= 0) linksCache[index] = updated;
    else linksCache.push(updated);
  });

  if (!updated) return null;
  return updated;
}

async function removeCharacterLinkByDiscordUserId(userId) {
  const targets = linksCache.filter(entry => entry.discordUserId === String(userId));
  if (!targets.length) return false;

  await withGlobalWriteLock(async () => {
    const snapshot = linksCache.filter(entry => entry.discordUserId !== String(userId));
    await replaceAllGarmothProfilesInSqlite(snapshot);
    linksCache = snapshot;
  });

  return true;
}

async function removeCharacterLink(discordUserId, guildId) {
  const current = linksCache.find(entry => isSameScope(entry, discordUserId, guildId));
  if (!current) return false;

  await withLinkLock(discordUserId, guildId, async () => {
    await removeLinkFromSqlite(discordUserId, guildId);
    linksCache = linksCache.filter(entry => !isSameScope(entry, discordUserId, guildId));
  });

  return true;
}

async function waitForGarmothProfileRepositoryIdle() {
  await globalWriteLock;
  await Promise.all(Array.from(linkLocks.values()).map(promise => promise.catch(() => null)));
}

function __resetGarmothProfileRepositoryForTests() {
  linksCache = [];
  initialized = false;
  globalWriteLock = Promise.resolve();
  linkLocks.clear();
}

module.exports = {
  initializeGarmothProfileRepository,
  waitForGarmothProfileRepositoryIdle,
  readGarmothProfilesFromSqlite,
  replaceAllGarmothProfilesInSqlite,
  loadCharacterLinks,
  saveCharacterLinks,
  getCharacterLinkByDiscordUserId,
  getCharacterLink,
  getCharacterLinksByGuild,
  upsertCharacterLink,
  updateCharacterLink,
  removeCharacterLinkByDiscordUserId,
  removeCharacterLink,
  __resetGarmothProfileRepositoryForTests
};
