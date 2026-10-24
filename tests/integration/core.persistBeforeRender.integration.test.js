const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { buildWar } = require('../factories/warFactory');
const { publishOrRefreshWarWithOptions } = require('../../src/services/eventPublicationService');
const {
  initScheduler,
  stopScheduler,
  checkAndExecuteEvents
} = require('../../src/services/schedulerService');

setupIntegrationSuite();

function createEditCapture(messageId) {
  const edits = [];
  const message = {
    id: messageId,
    edit: async payload => {
      edits.push(payload);
    },
    delete: async () => null
  };
  const channel = {
    send: async () => ({ id: 'unexpected_send' }),
    messages: {
      fetch: async id => (String(id) === messageId ? message : null)
    }
  };
  return { edits, channel };
}

function joinButtons(payload) {
  return payload.components
    .flatMap(row => row.components)
    .filter(component => String(component.data.custom_id || '').startsWith('join_'));
}

describe('core: persistir antes de renderizar', () => {
  afterEach(() => {
    stopScheduler();
  });

  it('el cierre automatico edita el mensaje con las inscripciones cerradas', async () => {
    const war = buildWar({
      id: 'core_close_render_1',
      messageId: 'core_close_msg_1',
      createdAt: Date.now() - 30 * 60 * 1000,
      closesAt: Date.now() - 60 * 1000,
      expiresAt: Date.now() + 30 * 60 * 1000,
      schedule: { enabled: false, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null },
      recap: { enabled: false }
    });
    await warService.createWar(war);

    const { edits, channel } = createEditCapture('core_close_msg_1');
    initScheduler({ channels: { fetch: async () => channel } });
    await checkAndExecuteEvents();

    const persisted = warService.loadWars().find(entry => entry.id === war.id);
    expect(persisted.isClosed).toBe(true);
    expect(edits.length).toBeGreaterThan(0);
    for (const payload of edits) {
      expect(payload.embeds[0].data.description).toContain('Cerradas');
      expect(joinButtons(payload).length).toBeGreaterThan(0);
      expect(joinButtons(payload).every(button => button.data.disabled === true)).toBe(true);
    }
  });

  it('activar un evento cerrado edita el mensaje con el estado nuevo', async () => {
    const war = buildWar({
      id: 'core_activate_render_1',
      messageId: 'core_activate_msg_1',
      isClosed: true,
      createdAt: Date.now() - 30 * 60 * 1000,
      closesAt: Date.now() + 60 * 60 * 1000,
      expiresAt: Date.now() + 90 * 60 * 1000,
      schedule: { enabled: false, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    await warService.createWar(war);

    const { edits, channel } = createEditCapture('core_activate_msg_1');
    const interaction = { guild: { channels: { fetch: async () => channel } } };
    const result = await publishOrRefreshWarWithOptions(interaction, warService.loadWars()[0], { activate: true });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('updated');
    expect(edits.length).toBe(1);
    expect(edits[0].embeds[0].data.description).toContain('Abiertas');
    expect(joinButtons(edits[0]).every(button => button.data.disabled === false)).toBe(true);
    const persisted = warService.loadWars().find(entry => entry.id === war.id);
    expect(persisted.isClosed).toBe(false);
    expect(persisted.schedule.enabled).toBe(true);
  });
});
