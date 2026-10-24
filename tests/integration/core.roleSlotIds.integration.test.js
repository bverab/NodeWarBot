const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar, buildWarRole } = require('../factories/warFactory');
const { getRoleByName, addParticipantToRole } = require('../../src/utils/warState');

setupIntegrationSuite();

async function slotsByName(eventId) {
  const rows = await prisma.eventRoleSlot.findMany({ where: { eventId }, orderBy: { position: 'asc' } });
  return rows.map(row => ({ id: row.id, name: row.name, position: row.position, max: row.max, emoji: row.emoji }));
}

describe('core: las escrituras del bot conservan los ids de EventRoleSlot', () => {
  it('inscribir, editar, reordenar, quitar y agregar roles no cambia los ids de los roles que siguen', async () => {
    const war = buildWar({
      id: 'core_slot_ids',
      roles: [buildWarRole({ name: 'Tank', max: 2 }), buildWarRole({ name: 'Healer', max: 2 }), buildWarRole({ name: 'DPS', max: 4 })]
    });
    await warService.createWar(war);
    const initial = await slotsByName(war.id);
    const idOf = name => initial.find(slot => slot.name === name).id;

    await warService.updateWarByMessageId(war.messageId, state => {
      addParticipantToRole(getRoleByName(state, 'Healer'), { userId: 'core_slot_user', displayName: 'U', isFake: false });
    });
    expect((await slotsByName(war.id)).map(slot => slot.id)).toEqual(initial.map(slot => slot.id));

    await warService.updateWarById(war.id, fresh => {
      const healer = getRoleByName(fresh, 'Healer');
      healer.max = 3;
      healer.emoji = '✅';
    });
    let slots = await slotsByName(war.id);
    expect(slots.map(slot => slot.id)).toEqual(initial.map(slot => slot.id));
    expect(slots[1]).toMatchObject({ name: 'Healer', max: 3, emoji: '✅' });

    await warService.updateWarById(war.id, fresh => {
      fresh.roles = [fresh.roles[2], fresh.roles[0], fresh.roles[1]];
    });
    slots = await slotsByName(war.id);
    expect(slots.map(slot => [slot.name, slot.id, slot.position])).toEqual([
      ['DPS', idOf('DPS'), 0],
      ['Tank', idOf('Tank'), 1],
      ['Healer', idOf('Healer'), 2]
    ]);
    const participants = await prisma.eventParticipant.findMany({ where: { eventId: war.id } });
    expect(participants.map(row => [row.userId, row.roleSlotId])).toEqual([['core_slot_user', idOf('Healer')]]);

    await warService.updateWarById(war.id, fresh => {
      fresh.roles = fresh.roles.filter(role => role.name !== 'Tank');
      fresh.roles.push({ name: 'Support', max: 1, users: [] });
    });
    slots = await slotsByName(war.id);
    expect(slots.map(slot => slot.name)).toEqual(['DPS', 'Healer', 'Support']);
    expect(slots[0].id).toBe(idOf('DPS'));
    expect(slots[1].id).toBe(idOf('Healer'));
    expect(initial.map(slot => slot.id)).not.toContain(slots[2].id);
    expect(await prisma.eventRoleSlot.findUnique({ where: { id: idOf('Tank') } })).toBeNull();
  });
});
