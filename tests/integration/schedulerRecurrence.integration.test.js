const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { buildWar } = require('../factories/warFactory');
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
      const id = `scheduler_msg_${sentCount}`;
      const message = {
        id,
        payload,
        delete: async () => {
          messages.delete(id);
        },
        edit: async () => null
      };
      messages.set(id, message);
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

  return { client, channel, getSentCount: () => sentCount };
}

describe('scheduler weekly recurrence integration', () => {
  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  it('mantiene viva la serie recurrente tras expirar una ocurrencia y republca la siguiente semana', async () => {
    vi.useFakeTimers();

    const firstSlot = new Date('2026-04-20T20:00:00.000Z');
    vi.setSystemTime(firstSlot);

    const recurringWar = buildWar({
      id: 'recurrence_alive_1',
      groupId: 'recurrence_alive_group',
      dayOfWeek: 1,
      time: '20:00',
      timezone: 'UTC',
      duration: 30,
      messageId: null,
      isClosed: false,
      schedule: {
        enabled: true,
        mode: 'recurring',
        lastCreatedAt: null,
        lastMessageIdDeleted: null
      }
    });
    await warService.createWar(recurringWar);

    const mocks = createSchedulerMocks();
    initScheduler(mocks.client);
    await checkAndExecuteEvents();

    let persisted = warService.loadWars().find(war => war.id === recurringWar.id);
    const initialSent = mocks.getSentCount();
    expect(initialSent).toBeGreaterThanOrEqual(1);
    expect(persisted.messageId).toMatch(/^scheduler_msg_\d+$/);
    expect(persisted.schedule.lastCreatedAt).toBe(firstSlot.getTime());

    vi.setSystemTime(new Date('2026-04-20T21:45:00.000Z'));
    await checkAndExecuteEvents();
    persisted = warService.loadWars().find(war => war.id === recurringWar.id);
    expect(persisted.messageId).toBeNull();
    expect(persisted.isClosed).toBe(true);
    expect(persisted.schedule.enabled).toBe(true);

    const nextWeekSlot = new Date('2026-04-27T20:00:00.000Z');
    vi.setSystemTime(nextWeekSlot);
    await checkAndExecuteEvents();

    persisted = warService.loadWars().find(war => war.id === recurringWar.id);
    expect(mocks.getSentCount()).toBe(initialSent + 1);
    expect(persisted.messageId).toBe(`scheduler_msg_${initialSent + 1}`);
    expect(persisted.isClosed).toBe(false);
    expect(persisted.schedule.enabled).toBe(true);
    expect(persisted.schedule.lastCreatedAt).toBe(nextWeekSlot.getTime());
  });

  it('mantiene coherencia operativa en serie multi-dia (martes + sabado) sin duplicaciones ni cruces', async () => {
    vi.useFakeTimers();

    const firstTuesdaySlot = new Date('2026-04-21T20:00:00.000Z');
    vi.setSystemTime(firstTuesdaySlot);

    const tuesdayWar = buildWar({
      id: 'recurrence_multi_day2',
      groupId: 'recurrence_multi_group',
      dayOfWeek: 2,
      time: '20:00',
      timezone: 'UTC',
      duration: 30,
      messageId: null,
      isClosed: false,
      schedule: {
        enabled: true,
        mode: 'recurring',
        lastCreatedAt: null,
        lastMessageIdDeleted: null
      }
    });
    const saturdayWar = buildWar({
      id: 'recurrence_multi_day6',
      groupId: 'recurrence_multi_group',
      dayOfWeek: 6,
      time: '20:00',
      timezone: 'UTC',
      duration: 30,
      messageId: null,
      isClosed: false,
      schedule: {
        enabled: true,
        mode: 'recurring',
        lastCreatedAt: null,
        lastMessageIdDeleted: null
      }
    });
    await warService.createWar(tuesdayWar);
    await warService.createWar(saturdayWar);

    const mocks = createSchedulerMocks();
    initScheduler(mocks.client);
    await checkAndExecuteEvents();

    let persistedTuesday = warService.loadWars().find(war => war.id === tuesdayWar.id);
    let persistedSaturday = warService.loadWars().find(war => war.id === saturdayWar.id);
    const initialSent = mocks.getSentCount();

    expect(initialSent).toBeGreaterThanOrEqual(1);
    expect(persistedTuesday.messageId).toMatch(/^scheduler_msg_\d+$/);
    expect(persistedSaturday.messageId).toBeNull();
    const tuesdayMsgWeek1 = persistedTuesday.messageId;

    // Re-ejecutar en el mismo slot no debe duplicar publicación.
    await checkAndExecuteEvents();
    expect(mocks.getSentCount()).toBe(initialSent);

    vi.setSystemTime(new Date('2026-04-21T21:45:00.000Z'));
    await checkAndExecuteEvents();
    persistedTuesday = warService.loadWars().find(war => war.id === tuesdayWar.id);
    persistedSaturday = warService.loadWars().find(war => war.id === saturdayWar.id);
    expect(persistedTuesday.messageId).toBeNull();
    expect(persistedTuesday.isClosed).toBe(true);
    expect(persistedSaturday.messageId).toBeNull();

    const firstSaturdaySlot = new Date('2026-04-25T20:00:00.000Z');
    vi.setSystemTime(firstSaturdaySlot);
    await checkAndExecuteEvents();
    persistedTuesday = warService.loadWars().find(war => war.id === tuesdayWar.id);
    persistedSaturday = warService.loadWars().find(war => war.id === saturdayWar.id);
    expect(mocks.getSentCount()).toBe(initialSent + 1);
    expect(persistedSaturday.messageId).toMatch(/^scheduler_msg_\d+$/);
    expect(persistedSaturday.messageId).not.toBe(tuesdayMsgWeek1);
    expect(persistedTuesday.messageId).toBeNull();
    const saturdayMsgWeek1 = persistedSaturday.messageId;

    vi.setSystemTime(new Date('2026-04-25T21:45:00.000Z'));
    await checkAndExecuteEvents();
    persistedSaturday = warService.loadWars().find(war => war.id === saturdayWar.id);
    expect(persistedSaturday.messageId).toBeNull();
    expect(persistedSaturday.isClosed).toBe(true);

    const nextTuesdaySlot = new Date('2026-04-28T20:00:00.000Z');
    vi.setSystemTime(nextTuesdaySlot);
    await checkAndExecuteEvents();
    persistedTuesday = warService.loadWars().find(war => war.id === tuesdayWar.id);
    persistedSaturday = warService.loadWars().find(war => war.id === saturdayWar.id);
    expect(mocks.getSentCount()).toBe(initialSent + 2);
    expect(persistedTuesday.messageId).toBe(`scheduler_msg_${initialSent + 2}`);
    expect(persistedTuesday.messageId).not.toBe(tuesdayMsgWeek1);
    expect(persistedSaturday.messageId).toBeNull();

    const nextSaturdaySlot = new Date('2026-05-02T20:00:00.000Z');
    vi.setSystemTime(nextSaturdaySlot);
    await checkAndExecuteEvents();
    persistedTuesday = warService.loadWars().find(war => war.id === tuesdayWar.id);
    persistedSaturday = warService.loadWars().find(war => war.id === saturdayWar.id);
    expect(mocks.getSentCount()).toBe(initialSent + 3);
    expect(persistedSaturday.messageId).toBe(`scheduler_msg_${initialSent + 3}`);
    expect(persistedSaturday.messageId).not.toBe(saturdayMsgWeek1);

    // La serie multi-dia sigue viva y consistente por ocurrencia.
    expect(persistedTuesday.groupId).toBe('recurrence_multi_group');
    expect(persistedSaturday.groupId).toBe('recurrence_multi_group');
    expect(persistedTuesday.dayOfWeek).toBe(2);
    expect(persistedSaturday.dayOfWeek).toBe(6);
    expect(persistedTuesday.schedule.enabled).toBe(true);
    expect(persistedSaturday.schedule.enabled).toBe(true);
    expect(persistedTuesday.messageId).toBeNull(); // expiro al llegar al slot de sabado siguiente
    expect(persistedSaturday.messageId).toMatch(/^scheduler_msg_\d+$/);
  });
});
