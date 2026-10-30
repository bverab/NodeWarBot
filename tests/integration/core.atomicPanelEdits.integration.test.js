const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar, buildWarRole } = require('../factories/warFactory');
const { getRoleByName, addParticipantToRole } = require('../../src/utils/warState');
const { setSelectedEventContext } = require('../../src/utils/eventAdminContextStore');
const { createInteraction, createModalFields, asAdmin } = require('../support/interaction/fakes');
const { EVENT_ADMIN_PANEL_ACTIONS } = require('../../src/handlers/interaction/eventAdminPanelActions');
const { EVENT_ADMIN_MODAL_ACTIONS } = require('../../src/handlers/modal/eventAdminModalActions');

setupIntegrationSuite();

const ADMIN_ID = 'core_admin';
const CHANNEL_ID = 'channel_1';

function deferred() {
  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });
  return { promise, resolve };
}

async function joinRole(messageId, roleName, userId) {
  await warService.updateWarByMessageId(messageId, state => {
    addParticipantToRole(getRoleByName(state, roleName), { userId, displayName: userId, isFake: false });
  });
}

async function participantsOf(eventId) {
  const rows = await prisma.eventParticipant.findMany({ where: { eventId }, orderBy: { joinedAt: 'asc' } });
  return rows.map(row => row.userId);
}

function createChannel({ gateFirstEdit = null } = {}) {
  let edits = 0;
  return {
    messages: {
      fetch: async id => ({
        id,
        edit: async () => {
          edits += 1;
          if (edits === 1 && gateFirstEdit) {
            gateFirstEdit.reached.resolve();
            await gateFirstEdit.release.promise;
          }
        }
      })
    }
  };
}

describe('core: ediciones del panel con inscripciones concurrentes', () => {
  it('elegir un icono del bot mientras alguien se inscribe no borra al inscrito', async () => {
    const war = buildWar({ id: 'core_atomic_icon', channelId: CHANNEL_ID, roles: [buildWarRole({ name: 'Flex', max: 5 })] });
    await warService.createWar(war);
    setSelectedEventContext(ADMIN_ID, 'guild_1', CHANNEL_ID, war.id, { scope: 'single', selectedRoleIndex: 0 });

    const reached = deferred();
    const release = deferred();
    const channel = createChannel();
    const interaction = asAdmin(createInteraction({
      customId: 'panel_event_role_icon_bot_pick',
      user: { id: ADMIN_ID, username: 'admin' },
      channelId: CHANNEL_ID,
      values: ['emoji_tank'],
      isStringSelectMenu: () => true,
      client: {
        application: {
          id: 'core_app',
          fetch: async () => {
            reached.resolve();
            await release.promise;
          },
          emojis: { fetch: async () => new Map([['emoji_tank', { id: 'emoji_tank', name: 'tank', animated: false }]]) }
        }
      }
    }));
    interaction.guild.channels.fetch = async () => channel;

    const pending = EVENT_ADMIN_PANEL_ACTIONS.panel_event_role_icon_bot_pick(interaction);
    await reached.promise;
    await joinRole(war.messageId, 'Flex', 'core_concurrent_joiner');
    release.resolve();
    await pending;

    const row = await prisma.eventRoleSlot.findFirst({ where: { eventId: war.id } });
    expect(row.emoji).toBe('<:tank:emoji_tank>');
    expect(await participantsOf(war.id)).toEqual(['core_concurrent_joiner']);
  });

  it('editar nombre de toda la serie mientras alguien se inscribe en otra ocurrencia no lo borra', async () => {
    const recurring = { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null };
    const first = buildWar({ id: 'core_atomic_series_day1', groupId: 'core_atomic_series', channelId: CHANNEL_ID, dayOfWeek: 1, schedule: recurring, roles: [buildWarRole({ name: 'Flex', max: 5 })] });
    const second = buildWar({ id: 'core_atomic_series_day3', groupId: 'core_atomic_series', channelId: CHANNEL_ID, dayOfWeek: 3, schedule: recurring, roles: [buildWarRole({ name: 'Flex', max: 5 })] });
    await warService.createWar(first);
    await warService.createWar(second);
    setSelectedEventContext(ADMIN_ID, 'guild_1', CHANNEL_ID, first.id, { scope: 'series' });

    const gate = { reached: deferred(), release: deferred() };
    const channel = createChannel({ gateFirstEdit: gate });
    const interaction = asAdmin(createInteraction({
      customId: 'panel_event_edit_data_basic_modal',
      user: { id: ADMIN_ID, username: 'admin' },
      channelId: CHANNEL_ID,
      isModalSubmit: () => true,
      fields: createModalFields({ panel_event_edit_data_name: 'Serie renombrada', panel_event_edit_data_type: '' })
    }));
    interaction.guild.channels.fetch = async () => channel;

    const pending = EVENT_ADMIN_MODAL_ACTIONS.panel_event_edit_data_basic_modal(interaction);
    await gate.reached.promise;
    await joinRole(second.messageId, 'Flex', 'core_series_joiner');
    gate.release.resolve();
    await pending;

    const secondRow = await prisma.event.findUnique({ where: { id: second.id } });
    expect(secondRow.name).toBe('Serie renombrada');
    expect(await participantsOf(second.id)).toEqual(['core_series_joiner']);
  });
});
