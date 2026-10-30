const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar, buildWarRole } = require('../factories/warFactory');
const { getRoleByName, addParticipantToRole } = require('../../src/utils/warState');
const { createInteraction, asAdmin } = require('../support/interaction/fakes');
const eventadmin = require('../../src/commands/eventadmin');

setupIntegrationSuite();

function deferred() {
  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('core: /eventadmin con inscripciones concurrentes', () => {
  it('role_slots mientras alguien se inscribe no borra al inscrito', async () => {
    const war = buildWar({ id: 'core_atomic_eventadmin', channelId: 'channel_1', roles: [buildWarRole({ name: 'Flex', max: 2 })] });
    await warService.createWar(war);

    const reached = deferred();
    const release = deferred();
    const message = { id: war.messageId, edit: async () => null };
    const interaction = asAdmin(createInteraction({
      isAutocomplete: () => false,
      options: {
        getSubcommand: () => 'role_slots',
        getString: name => ({ rol: 'Flex' }[name] ?? null),
        getInteger: () => 8
      },
      channel: {
        messages: {
          // resolveActiveWar lee los mensajes recientes del canal despues de tomar la lista de eventos.
          fetch: async () => {
            reached.resolve();
            await release.promise;
            return new Map([[war.messageId, message]]);
          }
        }
      }
    }));
    interaction.guild.channels.fetch = async () => ({ messages: { fetch: async () => message } });

    const pending = eventadmin.execute(interaction);
    await reached.promise;
    await warService.updateWarByMessageId(war.messageId, state => {
      addParticipantToRole(getRoleByName(state, 'Flex'), { userId: 'core_eventadmin_joiner', displayName: 'J', isFake: false });
    });
    release.resolve();
    await pending;

    expect(interaction.editReply.mock.calls.map(call => call[0].content)).toContain('Slots actualizados para **Flex**: 8');
    const slot = await prisma.eventRoleSlot.findFirst({ where: { eventId: war.id } });
    expect(slot.max).toBe(8);
    const participants = await prisma.eventParticipant.findMany({ where: { eventId: war.id } });
    expect(participants.map(row => row.userId)).toEqual(['core_eventadmin_joiner']);
  });
});
