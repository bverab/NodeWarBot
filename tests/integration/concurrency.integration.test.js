const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const { createWar, getWarByMessageId, updateWarByMessageId, updateWar } = require('../../src/db/warRepository');
const { getRoleByName, addParticipantToRole, removeFromWaitlist } = require('../../src/utils/warState');
const { buildWar, buildWarRole, buildParticipant } = require('../factories/warFactory');

setupIntegrationSuite();

describe('Concurrency integration', () => {
  it('dos intentos cercanos de registrar mismo usuario no duplican estado', async () => {
    const participant = buildParticipant({ userId: 'con_user_1' });
    const war = buildWar({
      roles: [buildWarRole({ name: 'A', max: 2, users: [] })]
    });
    await createWar(war);

    const joinOnce = () =>
      updateWarByMessageId(war.messageId, state => {
        const role = getRoleByName(state, 'A');
        if (!role) return { ok: false };
        if (!role.users.some(user => user.userId === participant.userId)) {
          addParticipantToRole(role, participant);
          removeFromWaitlist(state, participant.userId);
        }
        return { ok: true };
      });

    await Promise.all([joinOnce(), joinOnce()]);
    const finalWar = getWarByMessageId(war.messageId);
    const matches = finalWar.roles[0].users.filter(user => user.userId === participant.userId);

    expect(matches.length).toBe(1);
  });

  it('escrituras concurrentes basicas sobre mismo evento no corrompen estructura', async () => {
    const war = buildWar({ type: 'T0' });
    await createWar(war);

    const writeA = updateWar({ ...war, type: 'T_A' });
    const writeB = updateWar({ ...war, type: 'T_B', recap: { ...war.recap, messageText: 'B' } });
    await Promise.all([writeA, writeB]);

    const finalWar = getWarByMessageId(war.messageId);
    expect(['T_A', 'T_B']).toContain(finalWar.type);
    expect(Array.isArray(finalWar.roles)).toBe(true);
    expect(finalWar.recap).toBeTruthy();
    expect(finalWar.schedule).toBeTruthy();
  });
});
