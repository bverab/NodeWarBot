const { prisma } = require('../src/db/client');
const { exportSqliteToJson } = require('../src/db/exportSqliteToJson');

async function main() {
  const result = await exportSqliteToJson();
  console.log('[export] Carpeta:', result.outputDir);
  console.log('[export] Eventos:', result.exportedWars);
  console.log('[export] Perfiles Garmoth:', result.exportedGarmothProfiles);
}

main()
  .catch(error => {
    console.error('[export] Error exportando SQLite -> JSON:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => null);
  });
