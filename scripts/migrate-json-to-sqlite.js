const { importJsonToSqlite } = require('../src/db/importJsonToSqlite');
const { prisma } = require('../src/db/client');

async function main() {
  const force = process.argv.slice(2).includes('--force');
  const result = await importJsonToSqlite({ backup: true, force });
  if (result.backup) {
    console.log('[migration] Backup JSON creado en:', result.backup.backupDir);
  }
  if (result.databaseBackupPath) {
    console.log('[migration] Backup de la base creado en:', result.databaseBackupPath);
  }
  console.log('[migration] Eventos importados:', result.importedWars);
  console.log('[migration] Perfiles Garmoth importados:', result.importedGarmothProfiles);
}

main()
  .catch(error => {
    console.error('[migration] Error migrando JSON -> SQLite:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => null);
  });
