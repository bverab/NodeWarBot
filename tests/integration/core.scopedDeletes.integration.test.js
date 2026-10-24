const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const pveService = require('../../src/services/pveService');
const { prisma } = require('../../src/db/client');
const { buildWar } = require('../factories/warFactory');
const { editSeriesDay, removeSeriesDay } = require('../../src/services/recurrenceSeriesService');
const { handleScheduleCancel } = require('../../src/commands/event/eventAdmin');

setupIntegrationSuite();

const recurring = { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null };

async function createPveWithEnrollments(id) {
  const event = buildWar({
    id,
    groupId: `${id}_group`,
    eventType: 'pve',
    channelId: 'channel_pve_other',
    roles: [],
    waitlist: []
  });
  await warService.createWar(event);
  await pveService.saveEventSlots(event.id, [
    { position: 0, label: '20:00', time: '20:00', capacity: 3 },
    { position: 1, label: '21:00', time: '21:00', capacity: 3 }
  ]);
  const options = await pveService.getEventSlots(event.id);
  await pveService.joinSlot(event.id, options[0].id, { userId: `${id}_u1`, displayName: 'U1' });
  await pveService.joinSlot(event.id, options[1].id, { userId: `${id}_u2`, displayName: 'U2' });
  return event;
}

async function createExternalEvent() {
  await prisma.guild.upsert({ where: { id: 'guild_1' }, update: {}, create: { id: 'guild_1' } });
  await prisma.event.create({
    data: {
      id: 'core_external_web_1',
      eventType: 'war',
      accessMode: 'OPEN',
      name: 'Evento web',
      type: 'Node War',
      creatorId: 'user_web',
      guildId: 'guild_1',
      channelId: 'channel_web',
      messageId: null,
      timezone: 'America/Santiago',
      duration: 60,
      closeBeforeMinutes: 0,
      createdAt: new Date(),
      closesAt: new Date(Date.now() + 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      isClosed: false,
      roleSlots: { create: [{ position: 0, name: 'Flex', max: 5 }] }
    }
  });
}

async function snapshotCounts() {
  return {
    options: await prisma.eventOption.count(),
    enrollments: await prisma.eventEnrollment.count(),
    external: Boolean(await prisma.event.findUnique({ where: { id: 'core_external_web_1' } }))
  };
}

describe('core: borrados acotados al evento', () => {
  it('cancelar, quitar un dia y mover un dia no tocan otros eventos ni PvE ajeno', async () => {
    await createPveWithEnrollments('core_pve_a');
    await createPveWithEnrollments('core_pve_b');
    await createExternalEvent();

    const channelId = 'channel_series';
    const day1 = buildWar({ id: 'core_series_day1', groupId: 'core_series', channelId, dayOfWeek: 1, schedule: recurring });
    const day3 = buildWar({ id: 'core_series_day3', groupId: 'core_series', channelId, dayOfWeek: 3, schedule: recurring });
    const day5 = buildWar({ id: 'core_series_day5', groupId: 'core_series', channelId, dayOfWeek: 5, schedule: recurring });
    const cancelTarget = buildWar({ id: 'core_cancel_target', groupId: 'core_cancel_group', channelId, schedule: recurring });
    for (const war of [day1, day3, day5, cancelTarget]) {
      await warService.createWar(war);
    }

    const initial = await snapshotCounts();
    expect(initial).toEqual({ options: 4, enrollments: 4, external: true });

    const safeEphemeralReply = vi.fn();
    await handleScheduleCancel(
      { channelId, options: { getString: () => cancelTarget.id } },
      {
        warService,
        safeEphemeralReply,
        isAdminExecutor: () => true,
        getSanitizedOption: interaction => interaction.options.getString()
      }
    );
    expect(safeEphemeralReply.mock.calls[0][1]).toContain('Programacion cancelada');
    expect(await prisma.event.findUnique({ where: { id: cancelTarget.id } })).toBeNull();
    expect(warService.loadWars().some(war => war.id === cancelTarget.id)).toBe(false);
    expect(await snapshotCounts()).toEqual(initial);

    await removeSeriesDay(day1, channelId, day3.id);
    expect(await prisma.event.findUnique({ where: { id: day3.id } })).toBeNull();
    expect(warService.loadWars().some(war => war.id === day3.id)).toBe(false);
    expect(await snapshotCounts()).toEqual(initial);

    const moved = await editSeriesDay(day1, channelId, day5.id, '22:15', 6);
    expect(moved.id).toBe('core_series_day6');
    expect(await prisma.event.findUnique({ where: { id: day5.id } })).toBeNull();
    const movedRow = await prisma.event.findUnique({ where: { id: 'core_series_day6' } });
    expect(movedRow.messageId).toBe(day5.messageId);
    expect(movedRow.dayOfWeek).toBe(6);
    expect(warService.loadWars().filter(war => war.groupId === 'core_series').map(war => war.id).sort())
      .toEqual(['core_series_day1', 'core_series_day6']);
    expect(await snapshotCounts()).toEqual(initial);
    expect(await prisma.event.count()).toBe(5);
  });

  it('mover un dia PvE copia sus horarios al nuevo id', async () => {
    await createPveWithEnrollments('core_pve_keep');
    const channelId = 'channel_pve_series';
    const day2 = buildWar({ id: 'core_pve_series_day2', groupId: 'core_pve_series', eventType: 'pve', channelId, dayOfWeek: 2, roles: [], schedule: recurring });
    const day4 = buildWar({ id: 'core_pve_series_day4', groupId: 'core_pve_series', eventType: 'pve', channelId, dayOfWeek: 4, roles: [], schedule: recurring });
    await warService.createWar(day2);
    await warService.createWar(day4);
    await pveService.saveEventSlots(day4.id, [
      { position: 0, label: '19:00', time: '19:00', capacity: 4 },
      { position: 1, label: '20:30', time: '20:30', capacity: 2 }
    ]);

    const moved = await editSeriesDay(day2, channelId, day4.id, '21:00', 5);

    const slots = await pveService.getEventSlots(moved.id);
    expect(slots.map(slot => [slot.time, slot.capacity])).toEqual([['19:00', 4], ['20:30', 2]]);
    expect(await prisma.eventOption.count({ where: { eventId: day4.id } })).toBe(0);
    expect(await prisma.eventEnrollment.count({ where: { eventId: 'core_pve_keep' } })).toBe(2);
  });
});
