const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const { prisma } = require('../../src/db/client');
const warService = require('../../src/services/warService');
const { buildWar } = require('../factories/warFactory');
const { createBackup, formatTimestamp, parseArgs, pruneBackups } = require('../../scripts/backup-db');

setupIntegrationSuite();

describe('scripts/backup-db (A-15)', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodewarbot-backup-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function touchBackup(name) {
    fs.writeFileSync(path.join(dir, name), 'x');
  }

  it('crea una copia SQLite valida con los datos actuales', async () => {
    await warService.createWar(buildWar({ id: 'backup_war_1', name: 'Evento respaldado', messageId: null }));

    const result = await createBackup({ prisma, backupDir: dir, now: new Date('2026-10-24T03:15:30Z') });

    expect(path.basename(result.path)).toBe('nodewarbot-20261024-031530.db');
    const bytes = fs.readFileSync(result.path);
    expect(bytes.subarray(0, 15).toString('latin1')).toBe('SQLite format 3');
    expect(bytes.includes(Buffer.from('CREATE TABLE "Event"'))).toBe(true);
    expect(bytes.includes(Buffer.from('Evento respaldado'))).toBe(true);
  });

  it('no sobrescribe una copia existente', async () => {
    const now = new Date('2026-10-24T03:15:30Z');
    await createBackup({ prisma, backupDir: dir, now });

    await expect(createBackup({ prisma, backupDir: dir, now })).rejects.toThrow(/Ya existe/);
  });

  it('conserva solo las copias mas recientes y no toca otros archivos', () => {
    for (const name of [
      'nodewarbot-20261020-010000.db',
      'nodewarbot-20261021-010000.db',
      'nodewarbot-20261022-010000.db',
      'nodewarbot-20261023-010000.db',
      'nodewarbot-before-import.db',
      'notas.txt'
    ]) {
      touchBackup(name);
    }

    const removed = pruneBackups(dir, 2);

    expect(removed).toEqual(['nodewarbot-20261020-010000.db', 'nodewarbot-20261021-010000.db']);
    expect(fs.readdirSync(dir).sort()).toEqual([
      'nodewarbot-20261022-010000.db',
      'nodewarbot-20261023-010000.db',
      'nodewarbot-before-import.db',
      'notas.txt'
    ]);
  });

  it('createBackup aplica la retencion tras crear la copia', async () => {
    touchBackup('nodewarbot-20260101-000000.db');
    touchBackup('nodewarbot-20260102-000000.db');

    const result = await createBackup({ prisma, backupDir: dir, keep: 2, now: new Date('2026-10-24T03:15:30Z') });

    expect(result.pruned).toEqual(['nodewarbot-20260101-000000.db']);
    expect(fs.readdirSync(dir).sort()).toEqual([
      'nodewarbot-20260102-000000.db',
      'nodewarbot-20261024-031530.db'
    ]);
  });

  it('parseArgs valida --keep y --dir', () => {
    expect(parseArgs([])).toEqual({ keep: 14, dir: null });
    expect(parseArgs(['--keep=3', '--dir=./copias'])).toEqual({ keep: 3, dir: './copias' });
    expect(() => parseArgs(['--keep=0'])).toThrow(/--keep/);
    expect(() => parseArgs(['--keep=abc'])).toThrow(/--keep/);
    expect(() => parseArgs(['--otra'])).toThrow(/no reconocido/);
  });

  it('formatTimestamp usa UTC con ceros a la izquierda', () => {
    expect(formatTimestamp(new Date('2026-01-02T03:04:05Z'))).toBe('20260102-030405');
  });
});
