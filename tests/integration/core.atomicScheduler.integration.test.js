const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar, buildWarRole } = require('../factories/warFactory');
const { getRoleByName, addParticipantToRole } = require('../../src/utils/warState');
const {
  initScheduler,
  stopScheduler,
  checkAndExecuteEvents
} = require('../../src/services/schedulerService');

setupIntegrationSuite();

function deferred() {
  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function createClient() {
  const message = { edit: async () => null, delete: async () => null, startThread: async () => null };
  const channel = { messages: { fetch: async () => message } };
  return { channels: { fetch: async () => channel } };
}

// La autopublicacion web corre despues de que el tick toma su foto de los eventos: se detiene ahi
// para que una inscripcion entre en medio.
function pauseTickAfterSnapshot() {
  const reached = deferred();
  const release = deferred();
  const original = warService.loadDueScheduledPublishEvents;
  vi.spyOn(warService, 'loadDueScheduledPublishEvents').mockImplementation(async (...args) => {
    reached.resolve();
    await release.promise;
    return original(...args);
  });
  return { reached, release };
}

async function join(messageId, userId) {
  await warService.updateWarByMessageId(messageId, state => {
    addParticipantToRole(getRoleByName(state, 'Flex'), { userId, displayName: userId, isFake: false });
  });
}

describe('core: el scheduler no pisa inscripciones concurrentes', () => {
  afterEach(() => {
    stopScheduler();
    vi.restoreAllMocks();
  });

  it('el cierre automatico conserva a quien se inscribio mientras corria el tick', async () => {
    const war = buildWar({
      id: 'core_atomic_close',
      roles: [buildWarRole({ name: 'Flex', max: 5 })],
      createdAt: Date.now() - 30 * 60 * 1000,
      closesAt: Date.now() - 60 * 1000,
      expiresAt: Date.now() + 30 * 60 * 1000,
      schedule: { enabled: false, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null },
      recap: { enabled: false }
    });
    await warService.createWar(war);
    const pause = pauseTickAfterSnapshot();

    initScheduler(createClient());
    const tick = checkAndExecuteEvents();
    await pause.reached.promise;
    await join(war.messageId, 'core_late_admin_add');
    pause.release.resolve();
    await tick;

    const row = await prisma.event.findUnique({ where: { id: war.id } });
    expect(row.isClosed).toBe(true);
    const participants = await prisma.eventParticipant.findMany({ where: { eventId: war.id } });
    expect(participants.map(entry => entry.userId)).toEqual(['core_late_admin_add']);
  });

  it('la expiracion conserva el roster escrito mientras corria el tick', async () => {
    const war = buildWar({
      id: 'core_atomic_expire',
      roles: [buildWarRole({ name: 'Flex', max: 5 })],
      isClosed: true,
      createdAt: Date.now() - 90 * 60 * 1000,
      closesAt: Date.now() - 30 * 60 * 1000,
      expiresAt: Date.now() - 60 * 1000,
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: Date.now() - 90 * 60 * 1000, lastMessageIdDeleted: null },
      recap: { enabled: false }
    });
    await warService.createWar(war);
    const pause = pauseTickAfterSnapshot();

    initScheduler(createClient());
    const tick = checkAndExecuteEvents();
    await pause.reached.promise;
    await join(war.messageId, 'core_roster_entry');
    pause.release.resolve();
    await tick;

    const row = await prisma.event.findUnique({ where: { id: war.id } });
    expect(row.messageId).toBeNull();
    const participants = await prisma.eventParticipant.findMany({ where: { eventId: war.id } });
    expect(participants.map(entry => entry.userId)).toEqual(['core_roster_entry']);
  });
});
