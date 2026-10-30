const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const pveService = require('../../src/services/pveService');
const { prisma } = require('../../src/db/client');
const { buildWar } = require('../factories/warFactory');

setupIntegrationSuite();

describe('core: PvE no admite inscripciones despues del cierre', () => {
  it('con closesAt vencido no se puede entrar, pero si salir', async () => {
    const event = buildWar({ id: 'core_pve_closed_window', eventType: 'pve', roles: [], waitlist: [] });
    await warService.createWar(event);
    await pveService.saveEventSlots(event.id, [
      { position: 0, label: '20:00', time: '20:00', capacity: 5 },
      { position: 1, label: '21:00', time: '21:00', capacity: 5 }
    ]);
    const [first, second] = await pveService.getEventSlots(event.id);
    expect((await pveService.joinSlot(event.id, first.id, { userId: 'core_early_a', displayName: 'A' })).ok).toBe(true);
    expect((await pveService.joinSlot(event.id, second.id, { userId: 'core_early_b', displayName: 'B' })).ok).toBe(true);

    // closesAt ya paso pero el scheduler todavia no marco isClosed.
    await prisma.event.update({ where: { id: event.id }, data: { closesAt: new Date(Date.now() - 60 * 1000) } });

    const lateJoin = await pveService.joinSlot(event.id, first.id, { userId: 'core_late_user', displayName: 'Late' });
    expect(lateJoin).toEqual({ ok: false, reason: 'closed' });

    const toggleOff = await pveService.joinSlot(event.id, first.id, { userId: 'core_early_a', displayName: 'A' });
    expect(toggleOff).toEqual({ ok: true, reason: 'left' });
    expect(await pveService.leaveSlot(event.id, 'core_early_b')).toBe(true);

    expect(await prisma.eventEnrollment.count({ where: { eventId: event.id } })).toBe(0);
  });
});
