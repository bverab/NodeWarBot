const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { buildWar } = require('../factories/warFactory');
const {
  initScheduler,
  stopScheduler,
  waitForSchedulerIdle
} = require('../../src/services/schedulerService');

setupIntegrationSuite();

function buildClosableWar(id) {
  return buildWar({
    id,
    messageId: `${id}_msg`,
    createdAt: Date.now() - 30 * 60 * 1000,
    closesAt: Date.now() - 60 * 1000,
    expiresAt: Date.now() + 30 * 60 * 1000,
    schedule: { enabled: false, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null },
    recap: { enabled: false }
  });
}

describe('core: detener el scheduler con un tick en curso', () => {
  afterEach(() => {
    stopScheduler();
    vi.restoreAllMocks();
  });

  it('waitForSchedulerIdle espera el tick y el tick termina sin errores tras stopScheduler', async () => {
    await warService.createWar(buildClosableWar('core_stop_first'));
    await warService.createWar(buildClosableWar('core_stop_second'));
    const consoleError = vi.spyOn(console, 'error');

    let releaseFetch;
    const gate = new Promise(resolve => {
      releaseFetch = resolve;
    });
    let reachedFetch;
    const fetchReached = new Promise(resolve => {
      reachedFetch = resolve;
    });
    const channel = {
      messages: {
        fetch: async id => {
          reachedFetch();
          await gate;
          return { id, edit: async () => null };
        }
      }
    };

    initScheduler({ channels: { fetch: async () => channel } });
    await fetchReached;

    stopScheduler();
    let idle = false;
    const idlePromise = waitForSchedulerIdle().then(() => {
      idle = true;
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(idle).toBe(false);

    releaseFetch();
    await idlePromise;

    const wars = warService.loadWars();
    expect(wars.find(war => war.id === 'core_stop_first').isClosed).toBe(true);
    expect(wars.find(war => war.id === 'core_stop_second').isClosed).toBe(false);
    expect(consoleError.mock.calls.some(call => String(call[0]).includes('Error en scheduler'))).toBe(false);
  });

  it('waitForSchedulerIdle resuelve de inmediato sin tick en curso', async () => {
    await expect(waitForSchedulerIdle()).resolves.toBeUndefined();
  });
});
