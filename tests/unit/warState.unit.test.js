const {
  normalizeWar,
  removeParticipantFromAllRoles,
  addParticipantToRole,
  upsertWaitlistEntry,
  removeFromWaitlist
} = require('../../src/utils/warState');

describe('warState utils', () => {
  it('normaliza estructura minima con defaults estables', () => {
    const war = normalizeWar({ id: '1', roles: [{ name: 'Front', users: [] }] });
    expect(war.id).toBe('1');
    expect(war.duration).toBeGreaterThan(0);
    expect(Array.isArray(war.roles)).toBe(true);
    expect(war.schedule).toBeTruthy();
    expect(war.recap).toBeTruthy();
  });

  it('garantiza unicidad de usuario al remover de todos los roles', () => {
    const war = normalizeWar({
      id: '2',
      roles: [
        { name: 'A', max: 2, users: [{ userId: 'u1', displayName: 'U1', isFake: false }] },
        { name: 'B', max: 2, users: [{ userId: 'u1', displayName: 'U1', isFake: false }] }
      ]
    });

    const removed = removeParticipantFromAllRoles(war, 'u1');
    expect(removed).toBe(2);
    expect(war.roles.every(role => role.users.every(user => user.userId !== 'u1'))).toBe(true);
  });

  it('maneja waitlist y alta en rol de forma consistente', () => {
    const war = normalizeWar({
      id: '3',
      roles: [{ name: 'A', max: 1, users: [] }],
      waitlist: []
    });

    const role = war.roles[0];
    const joined = addParticipantToRole(role, { userId: 'u1', displayName: 'U1', isFake: false });
    const duplicate = addParticipantToRole(role, { userId: 'u1', displayName: 'U1', isFake: false });
    const waitlistAdded = upsertWaitlistEntry(war, { userId: 'u2', userName: 'U2', roleName: 'A' });
    const waitlistRemoved = removeFromWaitlist(war, 'u2');

    expect(joined).toBe(true);
    expect(duplicate).toBe(false);
    expect(waitlistAdded).toBe(true);
    expect(waitlistRemoved).toBe(true);
  });
});
