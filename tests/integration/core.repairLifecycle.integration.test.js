const fs = require('fs');
const path = require('path');
const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar } = require('../factories/warFactory');
const { formatTimeInEventZone } = require('../../src/utils/eventLifecycleTimes');
const { parseArgs, planLifecycleRepairs, runLifecycleRepair } = require('../../scripts/repair-lifecycle-times');

setupIntegrationSuite();

const TZ = 'America/Santiago';
const NOW = new Date('2026-05-05T19:40:00.000Z'); // martes 15:40 en Santiago
const CREATED = Date.parse('2026-05-04T19:37:00.000Z'); // lunes 15:37: hora de creacion del borrador
const SLOT = Date.parse('2026-05-06T02:00:00.000Z'); // martes 22:00 en Santiago
const MIN = 60 * 1000;
const recurring = { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null };

function damagedDraft(id, overrides = {}) {
  // Como lo guardaba /event create antes de NEW-1: cierre y fin relativos a la hora de creacion.
  return buildWar({
    id,
    groupId: id.replace(/_day\d$/, ''),
    messageId: null,
    dayOfWeek: 2,
    time: '22:00',
    timezone: TZ,
    duration: 70,
    closeBeforeMinutes: 10,
    createdAt: CREATED,
    closesAt: CREATED + 60 * MIN,
    expiresAt: CREATED + 70 * MIN,
    schedule: recurring,
    ...overrides
  });
}

async function seed() {
  await warService.createWar(damagedDraft('war_100_day2'));
  // Sano: cierre/fin coinciden con hora + duracion.
  await warService.createWar(damagedDraft('war_200_day2', { createdAt: SLOT, closesAt: SLOT + 60 * MIN, expiresAt: SLOT + 70 * MIN }));
  // Del dashboard: nunca se toca.
  await warService.createWar(damagedDraft('web_300'));
  // Publicado una vez con el dano: la duracion guardada ya no es confiable.
  await warService.createWar(damagedDraft('war_400_day2', {
    createdAt: SLOT - 7 * 24 * 60 * MIN,
    closesAt: SLOT - 7 * 24 * 60 * MIN,
    expiresAt: CREATED - 6 * 24 * 60 * MIN,
    duration: 1,
    closeBeforeMinutes: 0
  }));
  // Con mensaje vigente: se espera a que expire.
  await warService.createWar(damagedDraft('war_500_day2', { messageId: 'live_msg', expiresAt: NOW.getTime() + 30 * MIN, closesAt: NOW.getTime() + 20 * MIN }));
}

describe('core: scripts/repair-lifecycle-times (H4)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parseArgs: dry-run por defecto, --apply para escribir', () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(['--apply'])).toEqual({ apply: true });
    expect(() => parseArgs(['--force'])).toThrow('--force');
  });

  it('el dry-run lista solo eventos del bot con horas distintas a hora + duracion y no escribe', async () => {
    await seed();
    const before = await prisma.event.findMany({ orderBy: { id: 'asc' } });

    const plans = await planLifecycleRepairs({ now: NOW });

    expect(plans.map(plan => [plan.id, plan.action])).toEqual([
      ['war_100_day2', 'repair'],
      ['war_400_day2', 'manual'],
      ['war_500_day2', 'live']
    ]);
    expect(plans[0]).toMatchObject({ current: { close: '16:37', end: '16:47' }, expected: { close: '23:00', end: '23:10' } });
    expect(await prisma.event.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('--apply hace backup con VACUUM INTO y corrige solo los eventos reparables', async () => {
    await seed();
    const backupDir = path.resolve(process.cwd(), 'data', 'test', 'core-repair-backups');
    fs.rmSync(backupDir, { recursive: true, force: true });

    const result = await runLifecycleRepair({ apply: true, backupDir, now: NOW });

    expect(result.applied).toEqual(['war_100_day2']);
    expect(fs.readFileSync(result.backupPath).subarray(0, 15).toString('utf8')).toBe('SQLite format 3');
    const repaired = warService.loadWars().find(war => war.id === 'war_100_day2');
    expect(repaired.createdAt).toBe(SLOT);
    expect(formatTimeInEventZone(repaired.closesAt, TZ)).toBe('23:00');
    expect(formatTimeInEventZone(repaired.expiresAt, TZ)).toBe('23:10');
    const untouched = await prisma.event.findUnique({ where: { id: 'war_400_day2' } });
    expect(untouched.duration).toBe(1);
    const live = await prisma.event.findUnique({ where: { id: 'war_500_day2' } });
    expect(live.messageId).toBe('live_msg');
  });

  it('sin --apply no crea backup ni escribe', async () => {
    await seed();
    const backupDir = path.resolve(process.cwd(), 'data', 'test', 'core-repair-dry');
    fs.rmSync(backupDir, { recursive: true, force: true });

    const result = await runLifecycleRepair({ apply: false, backupDir, now: NOW });

    expect(result.applied).toEqual([]);
    expect(result.backupPath).toBeNull();
    expect(fs.existsSync(backupDir)).toBe(false);
  });
});
