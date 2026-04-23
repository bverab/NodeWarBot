const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { buildWar, buildWarRole, buildParticipant } = require('../factories/warFactory');
const { publishOrRefreshWar } = require('../../src/services/eventPublicationService');

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

describe('eventPublicationService integration', () => {
  it('publica evento sin messageId, persiste nuevo messageId y conserva roster por defecto', async () => {
    const sentMessages = [];
    const channel = {
      send: async payload => {
        const created = { id: 'msg_published_1', payload };
        sentMessages.push(created);
        return { id: created.id };
      },
      messages: {
        fetch: async () => null
      }
    };
    const interaction = createInteractionMock(channel);
    const war = buildWar({
      id: 'publish_war_1',
      messageId: null,
      roles: [buildWarRole({ name: 'A', max: 2, users: [buildParticipant({ userId: 'user1' })] })]
    });
    await warService.createWar(war);

    const result = await publishOrRefreshWar(interaction, war);
    const persisted = warService.loadWars().find(entry => entry.id === war.id);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('published');
    expect(sentMessages.length).toBe(1);
    expect(persisted.messageId).toBe('msg_published_1');
    expect(persisted.roles[0].users.length).toBe(1);
  });

  it('actualiza evento ya publicado si el mensaje existe', async () => {
    const edited = [];
    const message = {
      edit: async payload => {
        edited.push(payload);
      }
    };
    const channel = {
      send: async () => ({ id: 'unused' }),
      messages: {
        fetch: async id => (id === 'msg_existing_1' ? message : null)
      }
    };
    const interaction = createInteractionMock(channel);
    const war = buildWar({
      id: 'publish_war_2',
      messageId: 'msg_existing_1'
    });
    await warService.createWar(war);

    const result = await publishOrRefreshWar(interaction, war);
    expect(result.ok).toBe(true);
    expect(result.status).toBe('updated');
    expect(edited.length).toBe(1);
  });

  it('en pve restricted menciona usuarios permitidos al publicar', async () => {
    const sentMessages = [];
    const channel = {
      send: async payload => {
        sentMessages.push(payload);
        return { id: 'msg_pve_restricted' };
      },
      messages: {
        fetch: async () => null
      }
    };
    const interaction = createInteractionMock(channel);
    const event = buildWar({
      id: 'publish_pve_restricted_1',
      eventType: 'pve',
      messageId: null,
      roles: [],
      waitlist: [],
      accessMode: 'RESTRICTED',
      allowedUserIds: ['user_allowed_1', 'user_allowed_2'],
      notifyRoles: ['role_notify_should_not_be_used']
    });
    await warService.createWar(event);

    const result = await publishOrRefreshWar(interaction, event);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('published');
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].content).toContain('<@user_allowed_1>');
    expect(sentMessages[0].content).toContain('<@user_allowed_2>');
    expect(sentMessages[0].content).not.toContain('role_notify_should_not_be_used');
  });
});
