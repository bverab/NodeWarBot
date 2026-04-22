const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { updateWarByMessageId, getWarByMessageId } = require('../../src/db/warRepository');
const { getRoleByName, findParticipantRole, addParticipantToRole } = require('../../src/utils/warState');
const { publishOrRefreshWarWithOptions } = require('../../src/services/eventPublicationService');
const { buildWar, buildWarRole, buildParticipant } = require('../factories/warFactory');

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

async function tryJoin(messageId, roleName, participant) {
  return updateWarByMessageId(messageId, state => {
    const selectedRole = getRoleByName(state, roleName);
    if (!selectedRole) return { type: 'missing_role' };
    if (state.isClosed) return { type: 'closed' };

    const currentRole = findParticipantRole(state, participant.userId);
    if (currentRole && currentRole.name !== selectedRole.name) {
      currentRole.users = currentRole.users.filter(user => user.userId !== participant.userId);
    }
    addParticipantToRole(selectedRole, participant);
    return { type: 'joined' };
  });
}

describe('event close lifecycle integration', () => {
  it('cerrar bloquea nuevas inscripciones pero conserva asignaciones existentes', async () => {
    const war = buildWar({
      id: 'close_lifecycle_1',
      roles: [
        buildWarRole({
          name: 'A',
          max: 2,
          users: [buildParticipant({ userId: 'existing_user', displayName: 'Existing' })]
        })
      ],
      isClosed: false
    });
    await warService.createWar(war);

    await updateWarByMessageId(war.messageId, state => {
      state.isClosed = true;
      return { type: 'closed_by_admin' };
    });

    const joinAttempt = await tryJoin(war.messageId, 'A', buildParticipant({ userId: 'new_user', displayName: 'New' }));
    const persisted = getWarByMessageId(war.messageId);

    expect(joinAttempt.result.type).toBe('closed');
    expect(persisted.isClosed).toBe(true);
    expect(persisted.roles[0].users.map(user => user.userId)).toEqual(['existing_user']);
  });

  it('evento cerrado sigue editable y activacion/republicacion no limpia roster', async () => {
    const channel = {
      send: async () => ({ id: 'close_republish_msg_1' }),
      messages: {
        fetch: async () => null
      }
    };
    const interaction = createInteractionMock(channel);
    const war = buildWar({
      id: 'close_lifecycle_2',
      messageId: null,
      isClosed: true,
      roles: [
        buildWarRole({
          name: 'Front',
          max: 3,
          users: [buildParticipant({ userId: 'user_a', displayName: 'A' })]
        })
      ],
      waitlist: [
        {
          userId: 'user_wait',
          userName: 'Wait',
          roleName: 'Front',
          joinedAt: Date.now(),
          isFake: false
        }
      ]
    });
    await warService.createWar(war);

    // editable tras cierre
    war.name = 'Evento cerrado editado';
    await warService.updateWar(war);

    const result = await publishOrRefreshWarWithOptions(interaction, war, { activate: true });
    const persisted = warService.loadWars().find(entry => entry.id === war.id);

    expect(result.ok).toBe(true);
    expect(persisted.name).toBe('Evento cerrado editado');
    expect(persisted.isClosed).toBe(false);
    expect(persisted.roles[0].users.map(user => user.userId)).toEqual(['user_a']);
    expect(persisted.waitlist.map(entry => entry.userId)).toEqual(['user_wait']);
  });
});

