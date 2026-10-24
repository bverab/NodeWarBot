const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar } = require('../factories/warFactory');
const { addSeriesDays } = require('../../src/services/recurrenceSeriesService');
const { formatTimeInEventZone } = require('../../src/utils/eventLifecycleTimes');
const {
  initScheduler,
  stopScheduler,
  checkAndExecuteEvents
} = require('../../src/services/schedulerService');

setupIntegrationSuite();

function createSchedulerMocks() {
  let sentCount = 0;
  const messages = new Map();
  const channel = {
    send: async payload => {
      sentCount += 1;
      const id = `core_msg_${sentCount}`;
      messages.set(id, {
        id,
        payload,
        delete: async () => {
          messages.delete(id);
        },
        edit: async () => null
      });
      return { id };
    },
    messages: {
      fetch: async id => messages.get(String(id)) || null
    }
  };
  const client = {
    channels: {
      fetch: async () => channel
    }
  };
  return { client, getSentCount: () => sentCount };
}

describe('core: campos canonicos del ciclo de vida persisten', () => {
  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  it('un borrador programado conserva scheduledPublishAt al crear, actualizar y recargar', async () => {
    const createdAt = Date.parse('2026-05-04T12:00:00.000Z');
    const scheduledPublishAt = Date.parse('2026-05-05T22:00:00.000Z');
    const draft = buildWar({
      id: 'core_draft_scheduled_1',
      messageId: null,
      createdAt,
      closesAt: scheduledPublishAt + 60 * 60 * 1000,
      expiresAt: scheduledPublishAt + 90 * 60 * 1000,
      autoPublishEnabled: true,
      scheduledPublishAt
    });

    await warService.createWar(draft);
    let row = await prisma.event.findUnique({ where: { id: draft.id } });
    expect(row.scheduledPublishAt.getTime()).toBe(scheduledPublishAt);
    expect(row.createdAt.getTime()).toBe(createdAt);

    await warService.updateWar(warService.loadWars()[0]);
    row = await prisma.event.findUnique({ where: { id: draft.id } });
    expect(row.scheduledPublishAt.getTime()).toBe(scheduledPublishAt);

    const fresh = await warService.loadWarsFresh();
    expect(fresh[0].scheduledPublishAt).toBe(scheduledPublishAt);
    await warService.updateWar(fresh[0]);
    row = await prisma.event.findUnique({ where: { id: draft.id } });
    expect(row.scheduledPublishAt.getTime()).toBe(scheduledPublishAt);
  });

  it('al republicar la semana 2 guarda las horas de esa semana y un tick posterior no la cierra', async () => {
    vi.useFakeTimers();
    const firstSlot = new Date('2026-04-20T20:00:00.000Z');
    vi.setSystemTime(firstSlot);

    const recurringWar = buildWar({
      id: 'core_recurrence_week2',
      groupId: 'core_recurrence_week2_group',
      dayOfWeek: 1,
      time: '20:00',
      timezone: 'UTC',
      messageId: null,
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    await warService.createWar(recurringWar);

    const mocks = createSchedulerMocks();
    initScheduler(mocks.client);
    await checkAndExecuteEvents();

    vi.setSystemTime(new Date('2026-04-20T21:45:00.000Z'));
    await checkAndExecuteEvents();

    const nextWeekSlot = new Date('2026-04-27T20:00:00.000Z');
    vi.setSystemTime(nextWeekSlot);
    await checkAndExecuteEvents();

    let persisted = warService.loadWars().find(war => war.id === recurringWar.id);
    const sentAfterWeek2 = mocks.getSentCount();
    expect(persisted.messageId).toBe(`core_msg_${sentAfterWeek2}`);
    expect(persisted.createdAt).toBe(nextWeekSlot.getTime());
    expect(persisted.closesAt).toBeGreaterThan(nextWeekSlot.getTime());
    expect(persisted.expiresAt).toBeGreaterThan(nextWeekSlot.getTime());

    vi.setSystemTime(new Date(nextWeekSlot.getTime() + 2 * 60 * 1000));
    await checkAndExecuteEvents();

    persisted = warService.loadWars().find(war => war.id === recurringWar.id);
    expect(persisted.isClosed).toBe(false);
    expect(persisted.messageId).toBe(`core_msg_${sentAfterWeek2}`);
    expect(mocks.getSentCount()).toBe(sentAfterWeek2);
  });

  it('addSeriesDays conserva la hora de cierre y de fin del evento origen', async () => {
    const timezone = 'America/Santiago';
    const createdAt = Date.parse('2026-05-04T23:00:00.000Z');
    const base = buildWar({
      id: 'core_series_base_day1',
      groupId: 'core_series_base',
      dayOfWeek: 1,
      time: '19:00',
      timezone,
      createdAt,
      closesAt: createdAt + 50 * 60 * 1000,
      expiresAt: createdAt + 80 * 60 * 1000
    });
    await warService.createWar(base);
    const source = warService.loadWars().find(war => war.id === base.id);

    const result = await addSeriesDays(source, source.channelId, '19:00', '3');

    expect(result.createdWars.length).toBe(1);
    const created = warService.loadWars().find(war => war.id === result.createdWars[0].id);
    expect(formatTimeInEventZone(created.closesAt, timezone)).toBe(formatTimeInEventZone(source.closesAt, timezone));
    expect(formatTimeInEventZone(created.expiresAt, timezone)).toBe(formatTimeInEventZone(source.expiresAt, timezone));
  });
});
