const { moveRoleIndex } = require('../../src/services/roleOrderService');

describe('roleOrderService moveRoleIndex', () => {
  it('mueve un rol hacia arriba manteniendo los demas en orden', () => {
    const roles = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    const result = moveRoleIndex(roles, 2, 'up');

    expect(result.moved).toBe(true);
    expect(result.toIndex).toBe(1);
    expect(result.roles.map(role => role.name)).toEqual(['A', 'C', 'B']);
  });

  it('mueve un rol hacia abajo manteniendo los demas en orden', () => {
    const roles = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    const result = moveRoleIndex(roles, 0, 'down');

    expect(result.moved).toBe(true);
    expect(result.toIndex).toBe(1);
    expect(result.roles.map(role => role.name)).toEqual(['B', 'A', 'C']);
  });

  it('no mueve cuando el indice esta fuera de rango o en borde', () => {
    const roles = [{ name: 'A' }, { name: 'B' }];
    const atTop = moveRoleIndex(roles, 0, 'up');
    const atBottom = moveRoleIndex(roles, 1, 'down');
    const invalid = moveRoleIndex(roles, 4, 'down');

    expect(atTop.moved).toBe(false);
    expect(atBottom.moved).toBe(false);
    expect(invalid.moved).toBe(false);
  });
});

