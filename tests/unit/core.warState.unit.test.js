const { normalizeWar } = require('../../src/utils/warState');
const { applyLifecycleToWar } = require('../../src/utils/eventLifecycleTimes');

const T = Date.parse('2026-05-04T23:00:00.000Z');
const MINUTE = 60 * 1000;

const idempotenceCases = [
  ['minimo', { id: 'min_1' }],
  ['solo alias legacy', { id: 'alias_1', publishAt: T, signupCloseAt: T + 50 * MINUTE, eventEndAt: T + 60 * MINUTE }],
  ['canonicos con alias viejos', {
    id: 'mixed_1',
    createdAt: T + 7 * 24 * 60 * MINUTE,
    closesAt: T + 7 * 24 * 60 * MINUTE + 50 * MINUTE,
    expiresAt: T + 7 * 24 * 60 * MINUTE + 60 * MINUTE,
    publishAt: T,
    signupCloseAt: T + 50 * MINUTE,
    eventEndAt: T + 60 * MINUTE
  }],
  ['scheduledPublishAt distinto de createdAt', {
    id: 'draft_1',
    createdAt: T,
    closesAt: T + 50 * MINUTE,
    expiresAt: T + 60 * MINUTE,
    autoPublishEnabled: true,
    scheduledPublishAt: T + 120 * MINUTE
  }],
  ['dayOfWeek null', { id: 'dow_null', dayOfWeek: null, createdAt: T }],
  ['dayOfWeek string', { id: 'dow_str', dayOfWeek: '3', createdAt: T }],
  ['dayOfWeek fuera de rango', { id: 'dow_9', dayOfWeek: 9, createdAt: T }],
  ['con roles y waitlist', {
    id: 'roles_1',
    createdAt: T,
    roles: [{ name: 'DPS', max: 2, users: [{ userId: 'u1', displayName: 'U1' }] }],
    waitlist: [{ userId: 'u2', userName: 'U2', roleName: 'DPS', joinedAt: T }],
    schedule: { enabled: true, mode: 'recurring', lastCreatedAt: T },
    recap: { enabled: true, minutesBeforeExpire: 5, messageText: 'Resumen' }
  }]
];

describe('core: normalizeWar idempotente con campos canonicos', () => {
  it.each(idempotenceCases)('normalizeWar(normalizeWar(x)) == normalizeWar(x): %s', (_label, input) => {
    const once = normalizeWar(input);
    expect(normalizeWar(once)).toEqual(once);
  });

  it('los campos canonicos tienen prioridad sobre los alias', () => {
    const war = normalizeWar(idempotenceCases[2][1]);
    expect(war.createdAt).toBe(T + 7 * 24 * 60 * MINUTE);
    expect(war.closesAt).toBe(T + 7 * 24 * 60 * MINUTE + 50 * MINUTE);
    expect(war.expiresAt).toBe(T + 7 * 24 * 60 * MINUTE + 60 * MINUTE);
  });

  it('los alias solo se usan como respaldo para JSON antiguo', () => {
    const war = normalizeWar(idempotenceCases[1][1]);
    expect(war.createdAt).toBe(T);
    expect(war.closesAt).toBe(T + 50 * MINUTE);
    expect(war.expiresAt).toBe(T + 60 * MINUTE);
    expect(war.scheduledPublishAt).toBeNull();
  });

  it('no emite los alias en el objeto normalizado', () => {
    const war = normalizeWar(idempotenceCases[1][1]);
    expect(war).not.toHaveProperty('publishAt');
    expect(war).not.toHaveProperty('signupCloseAt');
    expect(war).not.toHaveProperty('eventEndAt');
  });

  it('scheduledPublishAt solo sale de scheduledPublishAt', () => {
    const war = normalizeWar(normalizeWar(idempotenceCases[3][1]));
    expect(war.scheduledPublishAt).toBe(T + 120 * MINUTE);
    expect(war.createdAt).toBe(T);
  });

  it.each([
    [null, null],
    [undefined, null],
    [0, 0],
    [6, 6],
    ['0', 0],
    ['3', 3],
    ['6', 6],
    [9, null],
    [-1, null],
    [7, null],
    [2.5, null],
    ['abc', null],
    ['', null]
  ])('dayOfWeek %j -> %j', (input, expected) => {
    expect(normalizeWar({ id: 'dow', dayOfWeek: input }).dayOfWeek).toBe(expected);
  });

  it('applyLifecycleToWar sobre un evento normalizado conserva las horas del ciclo tras normalizar', () => {
    const week1 = normalizeWar({
      id: 'lc_1',
      createdAt: T,
      closesAt: T + 50 * MINUTE,
      expiresAt: T + 60 * MINUTE,
      recap: { enabled: true }
    });
    const nextWeek = T + 7 * 24 * 60 * MINUTE;
    const lifecycle = {
      publishAt: new Date(nextWeek),
      signupCloseAt: new Date(nextWeek + 50 * MINUTE),
      eventEndAt: new Date(nextWeek + 60 * MINUTE)
    };

    const result = normalizeWar(applyLifecycleToWar({ ...week1 }, lifecycle));

    expect(result.createdAt).toBe(nextWeek);
    expect(result.scheduledPublishAt).toBe(nextWeek);
    expect(result.closesAt).toBe(nextWeek + 50 * MINUTE);
    expect(result.expiresAt).toBe(nextWeek + 60 * MINUTE);
  });
});
