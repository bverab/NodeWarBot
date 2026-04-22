const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma = globalForPrisma.__nodeWarBotPrisma || new PrismaClient({
  log: ['warn', 'error']
});

if (!globalForPrisma.__nodeWarBotPrisma) {
  globalForPrisma.__nodeWarBotPrisma = prisma;
}

module.exports = {
  prisma
};
