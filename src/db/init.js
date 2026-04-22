const { prisma } = require('./client');
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
    await initializeWarRepository();
    await initializeGarmothProfileRepository();
    initialized = true;
    logInfo('Persistencia inicializada (Prisma + SQLite).');
  } catch (error) {
    logError('Fallo al inicializar persistencia', error);
    throw error;
  }
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
