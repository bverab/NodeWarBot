const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { buildWar, buildWarRole, buildParticipant } = require('../factories/warFactory');
const { moveRoleIndex } = require('../../src/services/roleOrderService');
const { buildWarMessagePayload } = require('../../src/utils/warMessageBuilder');

setupIntegrationSuite();

describe('role reordering integration', () => {
  it('persiste mover rol hacia arriba sin mover participantes entre roles', async () => {
    const war = buildWar({
      id: 'role_order_war_1',
      roles: [
        buildWarRole({ name: 'Front', max: 2, users: [buildParticipant({ userId: 'u1', displayName: 'U1' })] }),
        buildWarRole({ name: 'Mid', max: 2, users: [buildParticipant({ userId: 'u2', displayName: 'U2' })] }),
        buildWarRole({ name: 'Back', max: 2, users: [buildParticipant({ userId: 'u3', displayName: 'U3' })] })
      ]
    });
    await warService.createWar(war);

    const result = moveRoleIndex(war.roles, 2, 'up');
    war.roles = result.roles;
    await warService.updateWar(war);

    const persisted = warService.loadWars().find(entry => entry.id === war.id);
    expect(persisted.roles.map(role => role.name)).toEqual(['Front', 'Back', 'Mid']);

    const backRole = persisted.roles.find(role => role.name === 'Back');
    expect(backRole.users.map(user => user.userId)).toEqual(['u3']);
  });

  it('mantiene orden consistente tras multiples movimientos y render respeta orden final', async () => {
    const war = buildWar({
      id: 'role_order_war_2',
      roles: [
        buildWarRole({ name: 'A', max: 1 }),
        buildWarRole({ name: 'B', max: 1 }),
        buildWarRole({ name: 'C', max: 1 }),
        buildWarRole({ name: 'D', max: 1 })
      ]
    });
    await warService.createWar(war);

    let move = moveRoleIndex(war.roles, 3, 'up');
    war.roles = move.roles;
    move = moveRoleIndex(war.roles, 2, 'up');
    war.roles = move.roles;
    move = moveRoleIndex(war.roles, 0, 'down');
    war.roles = move.roles;

    await warService.updateWar(war);

    const persisted = warService.loadWars().find(entry => entry.id === war.id);
    expect(persisted.roles.map(role => role.name)).toEqual(['D', 'A', 'B', 'C']);

    const payload = buildWarMessagePayload(persisted);
    const fieldNames = payload.embeds[0].data.fields
      .filter(field => !String(field.name).startsWith('📋 Waitlist') && field.name !== 'Registro')
      .map(field => String(field.name));

    expect(fieldNames[0]).toContain('D');
    expect(fieldNames[1]).toContain('A');
    expect(fieldNames[2]).toContain('B');
    expect(fieldNames[3]).toContain('C');
  });
});

