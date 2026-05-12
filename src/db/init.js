const { prisma } = require('./client');
const path = require('node:path');
const {
  initializeWarRepository,
  waitForWarRepositoryIdle
} = require('./warRepository');
const {
  initializeGarmothProfileRepository,
  waitForGarmothProfileRepositoryIdle
} = require('./garmothProfileRepository');
const { logInfo, logError } = require('./logger');

let initialized = false;

async function initializePersistence() {
  if (initialized) return;
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    await logDatabaseConnectionInfo();
    await initializeWarRepository();
    await initializeGarmothProfileRepository();
    initialized = true;
    logInfo('Persistencia inicializada (Prisma + SQLite).');
  } catch (error) {
    logError('Fallo al inicializar persistencia', error);
    throw error;
  }
}

async function logDatabaseConnectionInfo() {
  const rawUrl = String(process.env.DATABASE_URL || '');
  const sanitizedUrl = rawUrl.startsWith('file:')
    ? `file:${resolveSqlitePath(rawUrl)}`
    : rawUrl
      ? '[configured non-sqlite database url]'
      : '[DATABASE_URL not set]';
  const columns = await prisma.$queryRaw`PRAGMA table_info("Event")`;
  const columnNames = Array.isArray(columns) ? columns.map(column => column.name) : [];
  logInfo('Prisma DB configurada', {
    action: 'db_connection_info',
    databaseUrl: sanitizedUrl,
    autoPublishFieldsReady: ['autoPublishEnabled', 'scheduledPublishAt', 'publishError', 'lastPublishAttemptAt']
      .every(field => columnNames.includes(field))
  });
}

function resolveSqlitePath(rawUrl) {
  const value = rawUrl.replace(/^file:/, '').replace(/^"|"$/g, '');
  if (!value || value.startsWith(':')) {
    return value;
  }
  return path.resolve(__dirname, '../../prisma', value);
}

async function shutdownPersistence() {
  try {
    await waitForWarRepositoryIdle();
    await waitForGarmothProfileRepositoryIdle();
    await prisma.$disconnect();
    initialized = false;
    logInfo('Persistencia cerrada.');
  } catch (error) {
    logError('Fallo al cerrar persistencia', error);
  }
}

module.exports = {
  initializePersistence,
  shutdownPersistence
};
