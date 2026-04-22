const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const { createWar, getWarByMessageId, updateWarByMessageId } = require('../../src/db/warRepository');
const {
  getRoleByName,
  findParticipantRole,
  removeParticipantFromAllRoles,
  addParticipantToRole,
  upsertWaitlistEntry,
  removeFromWaitlist
} = require('../../src/utils/warState');
const { buildWar, buildWarRole, buildParticipant } = require('../factories/warFactory');

setupIntegrationSuite();

async function applyJoinLogic(messageId, roleName, participant) {
  return updateWarByMessageId(messageId, state => {
    const selectedRole = getRoleByName(state, roleName);
    if (!selectedRole) return { type: 'missing_role' };

    const isAlreadyInSelectedRole = selectedRole.users.some(user => user.userId === participant.userId);
    if (isAlreadyInSelectedRole) {
      selectedRole.users = selectedRole.users.filter(user => user.userId !== participant.userId);
      return { type: 'left_role' };
    }

    const currentRole = findParticipantRole(state, participant.userId);
    if (selectedRole.users.length >= selectedRole.max) {
      if (currentRole && currentRole.name !== selectedRole.name) {
        removeParticipantFromAllRoles(state, participant.userId);
      }
      removeFromWaitlist(state, participant.userId);
      upsertWaitlistEntry(state, {
        userId: participant.userId,
        userName: participant.displayName,
        roleName: selectedRole.name,
        joinedAt: Date.now(),
        isFake: false
      });
      return { type: 'waitlist' };
    }

    if (currentRole) {
      removeParticipantFromAllRoles(state, participant.userId);
    }
    addParticipantToRole(selectedRole, participant);
    removeFromWaitlist(state, participant.userId);
    return { type: currentRole ? 'switched' : 'joined' };
  });
}

describe('Participant flow consistency', () => {
  it('inscripcion normal y salida posterior del evento', async () => {
    const war = buildWar({
      roles: [buildWarRole({ name: 'A', max: 2, users: [] })]
    });
    const participant = buildParticipant({ userId: 'user_flow_1' });
    await createWar(war);

    const join = await applyJoinLogic(war.messageId, 'A', participant);
    const leave = await applyJoinLogic(war.messageId, 'A', participant);
    const finalWar = getWarByMessageId(war.messageId);

    expect(join.result.type).toBe('joined');
    expect(leave.result.type).toBe('left_role');
    expect(finalWar.roles[0].users.some(user => user.userId === participant.userId)).toBe(false);
  });

  it('mueve a waitlist cuando slot esta lleno y evita doble inscripcion', async () => {
    const fullUser = buildParticipant({ userId: 'user_full' });
    const incoming = buildParticipant({ userId: 'user_wait' });
    const war = buildWar({
      roles: [buildWarRole({ name: 'A', max: 1, users: [fullUser] })],
      waitlist: []
    });
    await createWar(war);

    await applyJoinLogic(war.messageId, 'A', incoming);
    await applyJoinLogic(war.messageId, 'A', incoming);
    const finalWar = getWarByMessageId(war.messageId);

    const waitlistMatches = finalWar.waitlist.filter(entry => entry.userId === incoming.userId);
    expect(waitlistMatches.length).toBe(1);
    expect(finalWar.roles[0].users.some(user => user.userId === incoming.userId)).toBe(false);
  });

  it('reasigna slots correctamente al cambiar de rol', async () => {
    const participant = buildParticipant({ userId: 'user_switch' });
    const war = buildWar({
      roles: [
        buildWarRole({ name: 'A', max: 2, users: [] }),
        buildWarRole({ name: 'B', max: 2, users: [] })
      ]
    });
    await createWar(war);

    await applyJoinLogic(war.messageId, 'A', participant);
    await applyJoinLogic(war.messageId, 'B', participant);
    const finalWar = getWarByMessageId(war.messageId);

    expect(finalWar.roles[0].users.some(user => user.userId === participant.userId)).toBe(false);
    expect(finalWar.roles[1].users.some(user => user.userId === participant.userId)).toBe(true);
  });
});
