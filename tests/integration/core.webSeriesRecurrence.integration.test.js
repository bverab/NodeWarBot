const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const {
  initScheduler,
  stopScheduler,
  checkAndExecuteEvents
} = require('../../src/services/schedulerService');

setupIntegrationSuite();

// Martes 2026-05-05 en UTC.
const PUBLISHED_AT = new Date('2026-05-05T18:00:00.000Z');
const SLOT = new Date('2026-05-05T21:00:00.000Z');

function createSchedulerMocks(existingMessageId = null) {
  const sent = [];
  const deleted = [];
  const messages = new Map();
  const register = id => {
    messages.set(id, { id, edit: async () => null, delete: async () => { deleted.push(id); messages.delete(id); } });
  };
  if (existingMessageId) register(existingMessageId);
  const channel = {
    send: async payload => {
      sent.push(payload);
      const id = `core_web_series_msg_${sent.length}`;
      register(id);
      return { id };
    },
    messages: { fetch: async id => messages.get(String(id)) || null }
  };
  return { client: { channels: { fetch: async () => channel } }, sent, deleted };
}

async function createWebWeeklyEvent({ id, messageId, autoPublishEnabled = false, scheduledPublishAt = null }) {
  await prisma.guild.upsert({ where: { id: 'guild_1' }, update: {}, create: { id: 'guild_1' } });
  await prisma.event.create({
    data: {
      id,
      groupId: `${id}_group`,
      eventType: 'war',
      accessMode: 'OPEN',
      name: 'Serie semanal web',
      type: 'Node War',
      creatorId: 'user_web',
      guildId: 'guild_1',
      channelId: 'channel_web',
      messageId,
      dayOfWeek: 2,
      time: '21:00',
      timezone: 'UTC',
      duration: 120,
      closeBeforeMinutes: 30,
      autoPublishEnabled,
      scheduledPublishAt,
      createdAt: SLOT,
      closesAt: new Date(SLOT.getTime() + 90 * 60 * 1000),
      expiresAt: new Date(SLOT.getTime() + 120 * 60 * 1000),
      isClosed: false,
      roleSlots: { create: [{ position: 0, name: 'Flex', max: 5 }] },
      schedule: { create: { enabled: true, mode: 'recurring', lastCreatedAt: null } },
      recap: { create: { enabled: false, minutesBeforeExpire: 0, messageText: '' } }
    }
  });
}

describe('core: la recurrencia semanal no pisa series web publicadas', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  it('una serie web publicada a mano el mismo dia no se toca a la hora del slot', async () => {
    vi.setSystemTime(PUBLISHED_AT);
    await createWebWeeklyEvent({ id: 'web_series_manual', messageId: 'web_live_msg' });
    const slot = await prisma.eventRoleSlot.findFirst({ where: { eventId: 'web_series_manual' } });
    await prisma.eventParticipant.create({
      data: { eventId: 'web_series_manual', roleSlotId: slot.id, userId: 'web_signed_user', displayName: 'Signed' }
    });
    const mocks = createSchedulerMocks('web_live_msg');

    vi.setSystemTime(SLOT);
    initScheduler(mocks.client);
    await checkAndExecuteEvents();

    const row = await prisma.event.findUnique({ where: { id: 'web_series_manual' } });
    expect(mocks.sent.length).toBe(0);
    expect(mocks.deleted).toEqual([]);
    expect(row.messageId).toBe('web_live_msg');
    const participants = await prisma.eventParticipant.findMany({ where: { eventId: 'web_series_manual' } });
    expect(participants.map(entry => entry.userId)).toEqual(['web_signed_user']);
  });

  it('la autopublicacion web registra lastCreatedAt y el slot del mismo dia no republica', async () => {
    const dueAt = new Date('2026-05-05T20:00:00.000Z');
    vi.setSystemTime(dueAt);
    await createWebWeeklyEvent({
      id: 'web_series_auto',
      messageId: null,
      autoPublishEnabled: true,
      scheduledPublishAt: new Date(dueAt.getTime() - 60 * 1000)
    });
    const mocks = createSchedulerMocks();

    initScheduler(mocks.client);
    await checkAndExecuteEvents();

    let persisted = warService.loadWars().find(war => war.id === 'web_series_auto');
    expect(mocks.sent.length).toBe(1);
    expect(persisted.messageId).toBe('core_web_series_msg_1');
    expect(persisted.schedule.lastCreatedAt).toBe(dueAt.getTime());

    vi.setSystemTime(SLOT);
    await checkAndExecuteEvents();

    persisted = warService.loadWars().find(war => war.id === 'web_series_auto');
    expect(mocks.sent.length).toBe(1);
    expect(mocks.deleted).toEqual([]);
    expect(persisted.messageId).toBe('core_web_series_msg_1');
  });
});
