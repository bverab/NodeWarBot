// Copia de seguridad de la base SQLite con `VACUUM INTO` (consistente aunque el bot y el dashboard
// esten escribiendo). Uso: pnpm db:backup [--keep=14] [--dir=ruta]
//
// Deja nodewarbot-YYYYMMDD-HHmmss.db en <NODEWARBOT_DATA_DIR o ./data>/backups y conserva solo las
// `keep` copias mas recientes. Solo se borran archivos con ese patron de nombre.
const fs = require('fs');
const path = require('path');

const BACKUP_NAME_PATTERN = /^nodewarbot-\d{8}-\d{6}\.db$/;
const DEFAULT_KEEP = 14;

function formatTimestamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function parseArgs(argv = []) {
  const options = { keep: DEFAULT_KEEP, dir: null };
  for (const arg of argv) {
    const keepMatch = arg.match(/^--keep=(.+)$/);
    if (keepMatch) {
      const keep = Number(keepMatch[1]);
      if (!Number.isInteger(keep) || keep < 1) {
        throw new Error('--keep debe ser un entero mayor o igual a 1.');
      }
      options.keep = keep;
      continue;
    }
    const dirMatch = arg.match(/^--dir=(.+)$/);
    if (dirMatch) {
      options.dir = dirMatch[1];
      continue;
    }
    throw new Error(`Argumento no reconocido: ${arg}`);
  }
  return options;
}

// Borra las copias mas antiguas (el nombre ordena por fecha) y devuelve las eliminadas.
function pruneBackups(backupDir, keep) {
  const backups = fs.readdirSync(backupDir)
    .filter(name => BACKUP_NAME_PATTERN.test(name))
    .sort();
  const stale = backups.slice(0, Math.max(0, backups.length - keep));
  for (const name of stale) {
    fs.rmSync(path.join(backupDir, name), { force: true });
  }
  return stale;
}

async function createBackup({ prisma, backupDir, keep = DEFAULT_KEEP, now = new Date() }) {
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `nodewarbot-${formatTimestamp(now)}.db`);
  if (fs.existsSync(target)) {
    throw new Error(`Ya existe una copia con ese nombre: ${target}`);
  }

  await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const pruned = pruneBackups(backupDir, keep);
  return { path: target, pruned };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { prisma } = require('../src/db/client');
  const { getDataDirPath } = require('../src/db/jsonStore');

  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL no esta definida (ver .env.example).');
    }
    const backupDir = options.dir ? path.resolve(options.dir) : path.join(getDataDirPath(), 'backups');
    const result = await createBackup({ prisma, backupDir, keep: options.keep });
    console.log('[backup] Copia creada en:', result.path);
    if (result.pruned.length > 0) {
      console.log(`[backup] Copias antiguas eliminadas (se conservan ${options.keep}):`, result.pruned.join(', '));
    }
  } finally {
    await prisma.$disconnect().catch(() => null);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[backup] Error creando la copia:', error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  BACKUP_NAME_PATTERN,
  createBackup,
  formatTimestamp,
  parseArgs,
  pruneBackups
};
