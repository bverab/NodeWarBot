const { prisma } = require('./client');
const { backupLegacyJsonFiles, readWarsJson, readGarmothLinksJson } = require('./jsonStore');
const { normalizeWar } = require('../utils/warState');
const { replaceAllWarsInSqlite } = require('./warRepository');
const { replaceAllGarmothProfilesInSqlite } = require('./garmothProfileRepository');
const { logInfo } = require('./logger');

function normalizeLegacyGarmothLink(link = {}) {
  return {
    discordUserId: String(link.discordUserId || ''),
    guildId: link.guildId ? String(link.guildId) : null,
    garmothProfileUrl: String(link.garmothProfileUrl || '').trim(),
    linkedAt: Number.isFinite(link.linkedAt) ? link.linkedAt : Date.now(),
    updatedAt: Number.isFinite(link.updatedAt) ? link.updatedAt : Date.now(),
    characterName: link.characterName ?? null,
    classId: Number.isFinite(link.classId) ? link.classId : null,
    className: link.className ?? null,
    specRaw: link.specRaw ?? null,
    spec: link.spec ?? null,
    gearScore: Number.isFinite(link.gearScore) ? link.gearScore : null,
    lastSyncAt: Number.isFinite(link.lastSyncAt) ? link.lastSyncAt : null,
    syncStatus: typeof link.syncStatus === 'string' ? link.syncStatus : 'not_synced',
    syncErrorMessage: link.syncErrorMessage ?? null
  };
}

async function importJsonToSqlite(options = {}) {
  const shouldBackup = options.backup !== false;
  const backupMeta = shouldBackup ? backupLegacyJsonFiles() : null;

  const wars = readWarsJson().map(normalizeWar);
  const garmothLinks = readGarmothLinksJson().map(normalizeLegacyGarmothLink)
    .filter(link => link.discordUserId && link.guildId && link.garmothProfileUrl);

  await prisma.$connect();
  await replaceAllWarsInSqlite(wars);
  await replaceAllGarmothProfilesInSqlite(garmothLinks);

  logInfo(`Importados ${wars.length} evento(s) y ${garmothLinks.length} perfil(es) Garmoth a SQLite.`);

  return {
    backup: backupMeta,
    importedWars: wars.length,
    importedGarmothProfiles: garmothLinks.length
  };
}

module.exports = {
  importJsonToSqlite
};
