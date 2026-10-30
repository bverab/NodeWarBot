const fs = require('fs');
const path = require('path');
const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const { prisma } = require('../../src/db/client');
const { createWar } = require('../../src/db/warRepository');
const { importJsonToSqlite } = require('../../src/db/importJsonToSqlite');
const { buildWar } = require('../factories/warFactory');

setupIntegrationSuite();

function useLegacyDir(name) {
  const dir = path.resolve(process.cwd(), 'data', 'test', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  process.env.NODEWARBOT_DATA_DIR = dir;
  return dir;
}

describe('core: import JSON no destructivo', () => {
  it('sin wars.json rechaza el import, no crea archivos y no toca la base', async () => {
    const dir = useLegacyDir('core-import-missing');
    await createWar(buildWar({ id: 'core_import_existing_1' }));

    await expect(importJsonToSqlite({ backup: true, force: true })).rejects.toThrow('wars.json');

    expect(await prisma.event.count()).toBe(1);
    expect(fs.existsSync(path.join(dir, 'wars.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'backups'))).toBe(false);
  });

  it('con wars.json invalido rechaza el import y no toca la base', async () => {
    const dir = useLegacyDir('core-import-invalid');
    fs.writeFileSync(path.join(dir, 'wars.json'), '[{"id": "roto"', 'utf8');
    await createWar(buildWar({ id: 'core_import_existing_2' }));

    await expect(importJsonToSqlite({ backup: false, force: true })).rejects.toThrow('wars.json');
    expect(await prisma.event.count()).toBe(1);

    fs.writeFileSync(path.join(dir, 'wars.json'), '{"id": "no es un arreglo"}', 'utf8');
    await expect(importJsonToSqlite({ backup: false, force: true })).rejects.toThrow('wars.json');
    expect(await prisma.event.count()).toBe(1);
  });

  it('sin force aborta si la base ya tiene eventos', async () => {
    const dir = useLegacyDir('core-import-no-force');
    fs.writeFileSync(path.join(dir, 'wars.json'), JSON.stringify([buildWar({ id: 'core_import_json_1' })]), 'utf8');
    await createWar(buildWar({ id: 'core_import_existing_3' }));

    await expect(importJsonToSqlite({ backup: true })).rejects.toThrow('--force');

    const ids = (await prisma.event.findMany({ select: { id: true } })).map(event => event.id);
    expect(ids).toEqual(['core_import_existing_3']);
  });

  it('con force hace backup de la base con VACUUM INTO antes de importar', async () => {
    const dir = useLegacyDir('core-import-force');
    fs.writeFileSync(path.join(dir, 'wars.json'), JSON.stringify([buildWar({ id: 'core_import_json_2' })]), 'utf8');
    await createWar(buildWar({ id: 'core_import_existing_4' }));

    const result = await importJsonToSqlite({ backup: true, force: true });

    expect(result.importedWars).toBe(1);
    expect(result.databaseBackupPath.startsWith(path.join(dir, 'backups'))).toBe(true);
    expect(fs.readFileSync(result.databaseBackupPath).subarray(0, 15).toString('utf8')).toBe('SQLite format 3');
    const ids = (await prisma.event.findMany({ select: { id: true } })).map(event => event.id);
    expect(ids).toEqual(['core_import_json_2']);
  });
});
