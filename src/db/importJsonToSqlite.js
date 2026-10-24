const fs = require('fs');
const path = require('path');
const { prisma } = require('./client');
const {
  backupLegacyJsonFiles,
  getGarmothFilePath,
  getWarsFilePath,
  readArrayJsonFileStrict
} = require('./jsonStore');
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

async function backupDatabase(backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, 'nodewarbot-before-import.db');
  await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  return target;
}

async function importJsonToSqlite(options = {}) {
  const shouldBackup = options.backup !== false;
  const force = Boolean(options.force);

  // Validar todo antes de tocar archivos o la base: el import reemplaza todos los eventos.
  const wars = readArrayJsonFileStrict(getWarsFilePath()).map(normalizeWar);
  const garmothLinks = readArrayJsonFileStrict(getGarmothFilePath(), { required: false })
    .map(normalizeLegacyGarmothLink)
    .filter(link => link.discordUserId && link.guildId && link.garmothProfileUrl);

  await prisma.$connect();
  const existingEvents = await prisma.event.count();
  if (existingEvents > 0 && !force) {
    throw new Error(`La base ya tiene ${existingEvents} evento(s). Usa --force para reemplazarlos (se hace backup antes).`);
  }

  // backupLegacyJsonFiles crea getDataDirPath()/backups/<timestamp>; la base se respalda ahi mismo.
  const backupMeta = shouldBackup ? backupLegacyJsonFiles() : null;
  const databaseBackupPath = shouldBackup ? await backupDatabase(backupMeta.backupDir) : null;

  await replaceAllWarsInSqlite(wars);
  await replaceAllGarmothProfilesInSqlite(garmothLinks);

  logInfo(`Importados ${wars.length} evento(s) y ${garmothLinks.length} perfil(es) Garmoth a SQLite.`);

  return {
    backup: backupMeta,
    databaseBackupPath,
    importedWars: wars.length,
    importedGarmothProfiles: garmothLinks.length
  };
}

module.exports = {
  importJsonToSqlite
};
