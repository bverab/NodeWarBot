const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar } = require('../factories/warFactory');
const { setSelectedEventContext } = require('../../src/utils/eventAdminContextStore');
const { createInteraction, createModalFields, asAdmin } = require('../support/interaction/fakes');
const { EVENT_ADMIN_PANEL_ACTIONS } = require('../../src/handlers/interaction/eventAdminPanelActions');
const { EVENT_ADMIN_MODAL_ACTIONS } = require('../../src/handlers/modal/eventAdminModalActions');

setupIntegrationSuite();

const ADMIN_ID = 'core_limits_admin';
const LONG_NAME = `Nodewar ${'N'.repeat(102)}`;
const LONG_RECAP = 'R'.repeat(1000);

function modalInput(interaction, customId) {
  const modal = interaction.showModal.mock.calls[0][0].toJSON();
  return modal.components.flatMap(row => row.components).find(component => component.custom_id === customId);
}

describe('core: los modales del panel aceptan los limites de normalizeWar (H7)', () => {
  it('un nombre de 110 caracteres y un recap de 1000 se muestran y se guardan completos', async () => {
    const war = buildWar({ id: 'core_limits_event', channelId: 'channel_1', name: LONG_NAME, recap: { enabled: true, minutesBeforeExpire: 5, messageText: LONG_RECAP } });
    await warService.createWar(war);
    expect(LONG_NAME).toHaveLength(110);
    setSelectedEventContext(ADMIN_ID, 'guild_1', 'channel_1', war.id, { scope: 'single' });
    const user = { id: ADMIN_ID, username: 'admin' };

    const openBasic = asAdmin(createInteraction({ customId: 'panel_event_data_edit_basic', user }));
    await EVENT_ADMIN_PANEL_ACTIONS.panel_event_data_edit_basic(openBasic);
    const nameInput = modalInput(openBasic, 'panel_event_edit_data_name');
    expect(nameInput.max_length).toBe(120);
    expect(nameInput.value).toBe(LONG_NAME);

    const openRecap = asAdmin(createInteraction({ customId: 'panel_event_data_edit_recap', user }));
    await EVENT_ADMIN_PANEL_ACTIONS.panel_event_data_edit_recap(openRecap);
    const recapInput = modalInput(openRecap, 'panel_event_edit_recap_message');
    expect(recapInput.max_length).toBe(1000);
    expect(recapInput.value).toBe(LONG_RECAP);

    const submitBasic = asAdmin(createInteraction({
      customId: 'panel_event_edit_data_basic_modal',
      user,
      isModalSubmit: () => true,
      fields: createModalFields({ panel_event_edit_data_name: `${LONG_NAME.slice(0, 109)}X`, panel_event_edit_data_type: '' })
    }));
    await EVENT_ADMIN_MODAL_ACTIONS.panel_event_edit_data_basic_modal(submitBasic);

    const submitRecap = asAdmin(createInteraction({
      customId: 'panel_event_edit_recap_modal',
      user,
      isModalSubmit: () => true,
      fields: createModalFields({ panel_event_edit_recap_minutes: '5', panel_event_edit_recap_message: `${LONG_RECAP.slice(0, 999)}Z` })
    }));
    await EVENT_ADMIN_MODAL_ACTIONS.panel_event_edit_recap_modal(submitRecap);

    const row = await prisma.event.findUnique({ where: { id: war.id }, include: { recap: true } });
    expect(row.name).toBe(`${LONG_NAME.slice(0, 109)}X`);
    expect(row.recap.messageText).toBe(`${LONG_RECAP.slice(0, 999)}Z`);
  });
});
