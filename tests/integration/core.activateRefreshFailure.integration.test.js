const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar } = require('../factories/warFactory');
const { publishOrRefreshWarWithOptions } = require('../../src/services/eventPublicationService');
const { setSelectedEventContext } = require('../../src/utils/eventAdminContextStore');
const { createInteraction, asAdmin, collectReplies } = require('../support/interaction/fakes');
const { EVENT_ADMIN_PANEL_ACTIONS } = require('../../src/handlers/interaction/eventAdminPanelActions');

setupIntegrationSuite();

function failingEditChannel() {
  const sent = [];
  const message = {
    edit: async () => {
      throw Object.assign(new Error('Internal Server Error'), { status: 500 });
    }
  };
  return {
    sent,
    channel: {
      send: async payload => {
        sent.push(payload);
        return { id: 'unexpected' };
      },
      messages: { fetch: async () => message }
    }
  };
}

function closedPublishedWar(id) {
  return buildWar({
    id,
    channelId: 'channel_1',
    messageId: `${id}_msg`,
    isClosed: true,
    createdAt: Date.now() - 30 * 60 * 1000,
    closesAt: Date.now() + 60 * 60 * 1000,
    expiresAt: Date.now() + 90 * 60 * 1000,
    schedule: { enabled: false, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null }
  });
}

describe('core: activar con fallo al editar el mensaje (H6)', () => {
  it('el servicio informa que el cambio se guardo pero el mensaje no se actualizo', async () => {
    const war = closedPublishedWar('core_activate_saved');
    await warService.createWar(war);
    const { channel, sent } = failingEditChannel();

    const result = await publishOrRefreshWarWithOptions({ guild: { channels: { fetch: async () => channel } } }, war, { activate: true });

    expect(result.ok).toBe(false);
    expect(result.saved).toBe(true);
    expect(result.status).toBe('saved_message_not_updated');
    expect(result.war.id).toBe(war.id);
    expect(sent.length).toBe(0);
    const row = await prisma.event.findUnique({ where: { id: war.id } });
    expect(row.isClosed).toBe(false);
  });

  it('el panel lo dice en la respuesta en vez de contarlo como fallido', async () => {
    const war = closedPublishedWar('core_activate_panel');
    await warService.createWar(war);
    setSelectedEventContext('core_admin', 'guild_1', 'channel_1', war.id, { scope: 'single' });
    const { channel } = failingEditChannel();
    const interaction = asAdmin(createInteraction({
      customId: 'panel_event_finish_publish',
      user: { id: 'core_admin', username: 'admin' }
    }));
    interaction.guild.channels.fetch = async () => channel;

    await EVENT_ADMIN_PANEL_ACTIONS.panel_event_finish_publish(interaction);

    const reply = collectReplies(interaction).join('\n');
    expect(reply).toContain('fallidos: 0');
    expect(reply).toContain('guardados sin actualizar el mensaje de Discord: 1');
  });
});
