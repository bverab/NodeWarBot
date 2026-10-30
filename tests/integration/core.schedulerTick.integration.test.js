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
      const id = `core_tick_msg_${sentCount}`;
      messages.set(id, { id, payload, delete: async () => messages.delete(id), edit: async () => null });
      return { id };
    },
    messages: {
      fetch: async id => messages.get(String(id)) || null
    }
  };
  return {
    client: { channels: { fetch: async () => channel } },
    getSentCount: () => sentCount
  };
}

describe('core: tick del scheduler single-flight y fallos aislados', () => {
  afterEach(() => {
    stopScheduler();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('llamadas concurrentes comparten el tick en curso y publican una sola vez', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const slot = new Date('2026-04-20T20:00:00.000Z');
    vi.setSystemTime(slot);

    const war = buildWar({
      id: 'core_tick_single_flight',
      dayOfWeek: 1,
      time: '20:00',
      timezone: 'UTC',
      messageId: null,
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    await warService.createWar(war);

    const mocks = createSchedulerMocks();
    initScheduler(mocks.client);
    const first = checkAndExecuteEvents();
    const second = checkAndExecuteEvents();

    expect(second).toBe(first);
    await second;

    const persisted = warService.loadWars().find(entry => entry.id === war.id);
    expect(mocks.getSentCount()).toBe(1);
    expect(persisted.messageId).toBe('core_tick_msg_1');

    await checkAndExecuteEvents();
    expect(mocks.getSentCount()).toBe(1);
  });

  it('un fallo al marcar un borrador web no impide publicar el siguiente candidato', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const dueAt = new Date('2026-05-05T22:00:00.000Z');
    vi.setSystemTime(dueAt);

    const withoutChannel = buildWar({
      id: 'core_tick_web_no_channel',
      messageId: null,
      autoPublishEnabled: true,
      scheduledPublishAt: dueAt.getTime() - 120_000,
      schedule: { enabled: false, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    withoutChannel.channelId = null;
    const publishable = buildWar({
      id: 'core_tick_web_ok',
      messageId: null,
      autoPublishEnabled: true,
      scheduledPublishAt: dueAt.getTime() - 60_000,
      schedule: { enabled: false, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    await warService.createWar(withoutChannel);
    await warService.createWar(publishable);

    vi.spyOn(warService, 'markScheduledPublishAttempt').mockRejectedValueOnce(new Error('db down'));

    const mocks = createSchedulerMocks();
    initScheduler(mocks.client);
    await checkAndExecuteEvents();

    const persisted = warService.loadWars().find(entry => entry.id === publishable.id);
    expect(mocks.getSentCount()).toBe(1);
    expect(persisted.messageId).toBe('core_tick_msg_1');
  });

  it('un fallo en la autopublicacion web no aborta el resto del tick', async () => {
    const war = buildWar({
      id: 'core_tick_close_after_web_error',
      messageId: 'core_tick_existing_msg',
      createdAt: Date.now() - 30 * 60 * 1000,
      closesAt: Date.now() - 60 * 1000,
      expiresAt: Date.now() + 30 * 60 * 1000,
      schedule: { enabled: false, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null },
      recap: { enabled: false }
    });
    await warService.createWar(war);

    vi.spyOn(warService, 'loadDueScheduledPublishEvents').mockRejectedValue(new Error('db down'));

    const mocks = createSchedulerMocks();
    initScheduler(mocks.client);
    await checkAndExecuteEvents();

    const persisted = warService.loadWars().find(entry => entry.id === war.id);
    expect(persisted.isClosed).toBe(true);
  });
});
