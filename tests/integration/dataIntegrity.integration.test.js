const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const { prisma } = require('../../src/db/client');
const { createWar } = require('../../src/db/warRepository');
const { buildWar, buildWarRole, buildParticipant } = require('../factories/warFactory');

setupIntegrationSuite();

describe('Data integrity constraints', () => {
  it('no permite duplicar messageId en eventos', async () => {
    const one = buildWar({ messageId: 'dup_msg' });
    const two = buildWar({ messageId: 'dup_msg' });
    await createWar(one);

    await expect(createWar(two)).rejects.toThrow();
  });

  it('no permite mismo participante en dos roles del mismo evento', async () => {
    const duplicatedUser = buildParticipant({ userId: 'dup_user', displayName: 'DupUser' });
    const war = buildWar({
      roles: [
        buildWarRole({ name: 'A', users: [duplicatedUser] }),
        buildWarRole({ name: 'B', users: [duplicatedUser] })
      ]
    });

    await expect(createWar(war)).rejects.toThrow();
  });

  it('enforce unicidad de posicion de slots por evento', async () => {
    const war = buildWar();
    await createWar(war);

    await expect(
      prisma.eventRoleSlot.create({
        data: {
          eventId: war.id,
          position: 0,
          name: 'ConflictingPosition',
          max: 1
        }
      })
    ).rejects.toThrow();
  });

  it('enforce unicidad de posicion en waitlist por evento', async () => {
    const war = buildWar({ waitlist: [{ userId: 'u1', userName: 'U1', roleName: 'A', joinedAt: Date.now(), isFake: false }] });
    await createWar(war);

    await expect(
      prisma.eventWaitlistEntry.create({
        data: {
          eventId: war.id,
          position: 0,
          userId: 'u2',
          userName: 'U2',
          roleName: 'A'
        }
      })
    ).rejects.toThrow();
  });

  it('respeta foreign keys y cascadas al borrar evento', async () => {
    const war = buildWar();
    await createWar(war);

    const roleCountBefore = await prisma.eventRoleSlot.count({ where: { eventId: war.id } });
    expect(roleCountBefore).toBeGreaterThan(0);

    await prisma.event.delete({ where: { id: war.id } });

    const roleCountAfter = await prisma.eventRoleSlot.count({ where: { eventId: war.id } });
    const participantCountAfter = await prisma.eventParticipant.count({ where: { eventId: war.id } });
    expect(roleCountAfter).toBe(0);
    expect(participantCountAfter).toBe(0);
  });

  it('no permite crear participantes huérfanos por FK', async () => {
    await expect(
      prisma.eventParticipant.create({
        data: {
          eventId: 'missing_event',
          roleSlotId: 'missing_slot',
          userId: 'u_missing',
          displayName: 'Missing'
        }
      })
    ).rejects.toThrow();
  });
});
