const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { buildWar } = require('../factories/warFactory');
const { publishOrRefreshWarWithOptions } = require('../../src/services/eventPublicationService');
const { shouldOfferPostEditDecision } = require('../../src/handlers/interaction/eventAdminPanelActions');

setupIntegrationSuite();

function createInteractionMock(channel) {
  return {
    guild: {
      channels: {
        fetch: async () => channel
      }
    }
  };
}

describe('post-edit activation integration', () => {
  it('ofrece decision explicita cuando el evento queda cerrado/sin publicar', async () => {
    const closedDraft = buildWar({
      id: 'post_edit_decision_1',
      isClosed: true,
      messageId: null
    });
    await warService.createWar(closedDraft);

    const result = shouldOfferPostEditDecision([closedDraft]);
    expect(result).toBe(true);
  });

  it('guardar cambios y activar publica evento cerrado y reactiva schedule recurrente', async () => {
    const sent = [];
    const channel = {
      send: async payload => {
        sent.push(payload);
        return { id: 'msg_activation_1' };
      },
      messages: {
        fetch: async () => null
      }
    };

    const interaction = createInteractionMock(channel);
    const war = buildWar({
      id: 'post_edit_activate_1',
      messageId: null,
      isClosed: true,
      schedule: { enabled: false, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    await warService.createWar(war);

    const result = await publishOrRefreshWarWithOptions(interaction, war, { activate: true });
    const persisted = warService.loadWars().find(entry => entry.id === war.id);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('published');
    expect(sent.length).toBe(1);
    expect(persisted.isClosed).toBe(false);
    expect(persisted.messageId).toBe('msg_activation_1');
    expect(persisted.schedule.enabled).toBe(true);
    expect(persisted.schedule.lastCreatedAt).toBeTypeOf('number');
  });

  it('guardar cambios sin activar conserva cambios y no publica automaticamente', async () => {
    const war = buildWar({
      id: 'post_edit_keep_1',
      messageId: null,
      isClosed: true
    });
    await warService.createWar(war);

    war.name = 'Nombre editado sin publicar';
    const updated = await warService.updateWar(war);
    const persisted = warService.loadWars().find(entry => entry.id === war.id);

    expect(updated.name).toBe('Nombre editado sin publicar');
    expect(persisted.name).toBe('Nombre editado sin publicar');
    expect(persisted.messageId).toBeNull();
    expect(persisted.isClosed).toBe(true);
  });

  it('activar maneja messageId stale y crea nuevo mensaje publicable', async () => {
    const channel = {
      send: async () => ({ id: 'msg_after_stale' }),
      messages: {
        fetch: async () => null
      }
    };
    const interaction = createInteractionMock(channel);
    const war = buildWar({
      id: 'post_edit_activate_stale',
      messageId: 'msg_stale_missing',
      isClosed: true
    });
    await warService.createWar(war);

    const result = await publishOrRefreshWarWithOptions(interaction, war, { activate: true });
    const persisted = warService.loadWars().find(entry => entry.id === war.id);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('published');
    expect(persisted.messageId).toBe('msg_after_stale');
    expect(persisted.isClosed).toBe(false);
  });
});
