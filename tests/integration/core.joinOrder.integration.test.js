const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar, buildWarRole } = require('../factories/warFactory');
const { getRoleByName, addParticipantToRole, normalizeWar } = require('../../src/utils/warState');

setupIntegrationSuite();

const T0 = new Date('2026-05-05T20:00:00.000Z');

async function join(messageId, roleName, userId) {
  return warService.updateWarByMessageId(messageId, state => {
    addParticipantToRole(getRoleByName(state, roleName), { userId, displayName: userId, isFake: false });
    return { type: 'joined' };
  });
}

async function createExternalEvent({ id, createdAt, closesAt, expiresAt, duration, closeBeforeMinutes, participants = [] }) {
  await prisma.guild.upsert({ where: { id: 'guild_1' }, update: {}, create: { id: 'guild_1' } });
  await prisma.event.create({
    data: {
      id,
      eventType: 'war',
      accessMode: 'OPEN',
      name: 'Evento web',
      type: 'Node War',
      creatorId: 'user_web',
      guildId: 'guild_1',
      channelId: 'channel_web',
      messageId: `${id}_msg`,
      timezone: 'America/Santiago',
      duration,
      closeBeforeMinutes,
      createdAt,
      closesAt,
      expiresAt,
      isClosed: false,
      roleSlots: { create: [{ position: 0, name: 'Flex', max: 5 }] }
    }
  });
  const slot = await prisma.eventRoleSlot.findFirst({ where: { eventId: id } });
  for (const participant of participants) {
    await prisma.eventParticipant.create({
      data: { eventId: id, roleSlotId: slot.id, userId: participant.userId, displayName: participant.userId, joinedAt: participant.joinedAt }
    });
  }
}

describe('core: orden de inscripcion y campos del dashboard estables', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('joinedAt de cada participante se conserva al reescribir el evento', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const war = buildWar({ id: 'core_join_order_1', roles: [buildWarRole({ name: 'Flex', max: 5 })] });
    await warService.createWar(war);

    vi.setSystemTime(new Date(T0.getTime() + 60 * 1000));
    await join(war.messageId, 'Flex', 'user_b');
    vi.setSystemTime(new Date(T0.getTime() + 2 * 60 * 1000));
    await join(war.messageId, 'Flex', 'user_a');
    vi.setSystemTime(new Date(T0.getTime() + 10 * 60 * 1000));
    const current = warService.loadWars().find(entry => entry.id === war.id);
    current.name = 'Renombrado';
    await warService.updateWar(current);

    const rows = await prisma.eventParticipant.findMany({ where: { eventId: war.id }, orderBy: { joinedAt: 'asc' } });
    expect(rows.map(row => [row.userId, row.joinedAt.getTime()])).toEqual([
      ['user_b', T0.getTime() + 60 * 1000],
      ['user_a', T0.getTime() + 2 * 60 * 1000]
    ]);

    const fresh = await warService.loadWarsFresh();
    expect(fresh.find(entry => entry.id === war.id).roles[0].users.map(user => user.userId)).toEqual(['user_b', 'user_a']);
  });

  it('el orden leido sigue joinedAt aunque las filas se hayan insertado en otro orden', async () => {
    await createExternalEvent({
      id: 'core_join_order_web',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      closesAt: new Date(Date.now() + 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 90 * 60 * 1000),
      duration: 90,
      closeBeforeMinutes: 30,
      participants: [
        { userId: 'user_a', joinedAt: new Date(Date.now() - 5 * 60 * 1000) },
        { userId: 'user_b', joinedAt: new Date(Date.now() - 10 * 60 * 1000) }
      ]
    });

    const fresh = await warService.loadWarsFresh();
    expect(fresh.find(entry => entry.id === 'core_join_order_web').roles[0].users.map(user => user.userId))
      .toEqual(['user_b', 'user_a']);
  });

  it('duration y closeBeforeMinutes validos de entrada no se recalculan desde createdAt', async () => {
    await createExternalEvent({
      id: 'core_duration_web',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      closesAt: new Date(Date.now() + 75 * 60 * 1000),
      expiresAt: new Date(Date.now() + 90 * 60 * 1000),
      duration: 90,
      closeBeforeMinutes: 15
    });

    const fresh = await warService.loadWarsFresh();
    const event = fresh.find(entry => entry.id === 'core_duration_web');
    expect(event.duration).toBe(90);
    expect(event.closeBeforeMinutes).toBe(15);

    await warService.updateWar(event);
    const row = await prisma.event.findUnique({ where: { id: 'core_duration_web' } });
    expect(row.duration).toBe(90);
    expect(row.closeBeforeMinutes).toBe(15);
  });

  it('nombre de evento de hasta 120 y recap de hasta 1000 caracteres no se recortan', () => {
    const name = 'N'.repeat(120);
    const messageText = 'R'.repeat(1000);
    const war = normalizeWar({ id: 'core_limits', name, recap: { enabled: true, messageText } });

    expect(war.name).toBe(name);
    expect(war.recap.messageText).toBe(messageText);
    expect(normalizeWar({ id: 'core_limits_2', name: 'N'.repeat(130) }).name.length).toBe(120);
  });
});
