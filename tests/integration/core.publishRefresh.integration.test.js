const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { buildWar } = require('../factories/warFactory');
const { publishOrRefreshWar } = require('../../src/services/eventPublicationService');

setupIntegrationSuite();

const NOW = new Date('2026-05-05T15:00:00.000Z');

function buildPublishableWar(overrides) {
  return buildWar({
    dayOfWeek: 2,
    time: '20:00',
    timezone: 'America/Santiago',
    createdAt: NOW.getTime(),
    closesAt: Date.parse('2026-05-06T00:30:00.000Z'),
    expiresAt: Date.parse('2026-05-06T01:00:00.000Z'),
    ...overrides
  });
}

function createChannel({ editError = null, messageExists = true } = {}) {
  const sent = [];
  const message = {
    edit: async () => {
      if (editError) throw editError;
    },
    delete: async () => null
  };
  const channel = {
    send: async payload => {
      sent.push(payload);
      return { id: `core_refresh_new_${sent.length}` };
    },
    messages: {
      fetch: async () => (messageExists ? message : null)
    }
  };
  return { channel, sent };
}

describe('core: publishOrRefresh solo republica si el mensaje ya no existe', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('un error 500 al editar devuelve el error sin publicar un mensaje nuevo', async () => {
    const war = buildPublishableWar({ id: 'core_refresh_500', messageId: 'core_refresh_old_1' });
    await warService.createWar(war);
    const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const { channel, sent } = createChannel({ editError: serverError });

    const result = await publishOrRefreshWar({ guild: { channels: { fetch: async () => channel } } }, war);

    expect(sent.length).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    const persisted = warService.loadWars().find(entry => entry.id === war.id);
    expect(persisted.messageId).toBe('core_refresh_old_1');
  });

  it('sin permisos para editar no duplica el mensaje', async () => {
    const war = buildPublishableWar({ id: 'core_refresh_403', messageId: 'core_refresh_old_2' });
    await warService.createWar(war);
    const forbidden = Object.assign(new Error('Missing Permissions'), { code: 50013 });
    const { channel, sent } = createChannel({ editError: forbidden });

    const result = await publishOrRefreshWar({ guild: { channels: { fetch: async () => channel } } }, war);

    expect(sent.length).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('missing_permissions');
  });

  it('si el mensaje ya no existe publica uno nuevo', async () => {
    const war = buildPublishableWar({ id: 'core_refresh_missing', messageId: 'core_refresh_old_3' });
    await warService.createWar(war);
    const { channel, sent } = createChannel({ messageExists: false });

    const result = await publishOrRefreshWar({ guild: { channels: { fetch: async () => channel } } }, war);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('published');
    expect(sent.length).toBe(1);
  });
});
