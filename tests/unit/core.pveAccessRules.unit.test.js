const {
  ACCESS_MODES,
  normalizeAccessMode,
  getMemberRoleIds,
  hasPveAccess,
  buildPublicationMentions,
  describePveAccess
} = require('../../src/services/pveAccessRules');

function pve(extra = {}) {
  return { eventType: 'pve', accessMode: 'OPEN', allowedUserIds: [], allowedRoleIds: [], notifyRoles: [], ...extra };
}

describe('core: acceso PvE — modos', () => {
  it('normaliza los tres modos y lee RESTRICTED (modo antiguo) como por personas', () => {
    expect(ACCESS_MODES).toEqual(['OPEN', 'ROLES', 'USERS']);
    expect(normalizeAccessMode(undefined)).toBe('OPEN');
    expect(normalizeAccessMode('roles')).toBe('ROLES');
    expect(normalizeAccessMode('USERS')).toBe('USERS');
    expect(normalizeAccessMode('RESTRICTED')).toBe('USERS');
    expect(normalizeAccessMode('cualquier cosa')).toBe('OPEN');
  });

  it('lee los roles de un GuildMember, de un miembro crudo de la API o de nada', () => {
    expect(getMemberRoleIds({ roles: { cache: new Map([['r1', {}], ['r2', {}]]) } })).toEqual(['r1', 'r2']);
    expect(getMemberRoleIds({ roles: ['r3'] })).toEqual(['r3']);
    expect(getMemberRoleIds(null)).toEqual([]);
  });
});

describe('core: acceso PvE — quien entra como titular', () => {
  it('abierto: cualquiera', () => {
    expect(hasPveAccess(pve(), { userId: 'u1', userRoleIds: [] })).toBe(true);
  });

  it('por personas: solo las seleccionadas (tambien con el modo antiguo RESTRICTED)', () => {
    const event = pve({ accessMode: 'USERS', allowedUserIds: ['u1'] });
    expect(hasPveAccess(event, { userId: 'u1' })).toBe(true);
    expect(hasPveAccess(event, { userId: 'u2', userRoleIds: ['r1'] })).toBe(false);
    expect(hasPveAccess({ ...event, accessMode: 'RESTRICTED' }, { userId: 'u1' })).toBe(true);
  });

  it('por roles: quien tenga alguno de los roles; sin roles configurados nadie', () => {
    const event = pve({ accessMode: 'ROLES', allowedRoleIds: ['r1', 'r2'], allowedUserIds: ['u9'] });
    expect(hasPveAccess(event, { userId: 'u1', userRoleIds: ['r0', 'r2'] })).toBe(true);
    expect(hasPveAccess(event, { userId: 'u2', userRoleIds: ['r0'] })).toBe(false);
    // La lista de personas no cuenta en modo por roles.
    expect(hasPveAccess(event, { userId: 'u9', userRoleIds: [] })).toBe(false);
    expect(hasPveAccess(pve({ accessMode: 'ROLES' }), { userId: 'u1', userRoleIds: ['r1'] })).toBe(false);
  });
});

describe('core: acceso PvE — menciones al publicar', () => {
  it('por personas menciona a las personas seleccionadas, no a los roles a notificar', () => {
    const mentions = buildPublicationMentions(pve({ accessMode: 'USERS', allowedUserIds: ['u1', 'u2', 'u1'], notifyRoles: ['n1'] }), 'Evento publicado');
    expect(mentions.content).toBe('<@u1> <@u2>');
    expect(mentions.allowedMentions).toEqual({ parse: [], users: ['u1', 'u2'] });
  });

  it('por roles menciona a los roles permitidos', () => {
    const mentions = buildPublicationMentions(pve({ accessMode: 'ROLES', allowedRoleIds: ['r1', 'r2'], notifyRoles: ['n1'] }), 'Evento publicado');
    expect(mentions.content).toBe('<@&r1> <@&r2>');
    expect(mentions.allowedMentions).toEqual({ parse: [], roles: ['r1', 'r2'] });
  });

  it('abierto (y cualquier War) usa los roles a notificar', () => {
    expect(buildPublicationMentions(pve({ notifyRoles: ['n1'] }), 'x').allowedMentions).toEqual({ parse: [], roles: ['n1'] });
    const war = { eventType: 'war', accessMode: 'USERS', allowedUserIds: ['u1'], notifyRoles: ['n2'] };
    expect(buildPublicationMentions(war, 'x').content).toBe('<@&n2>');
  });

  it('sin destinatarios usa el texto de respaldo y no menciona a nadie', () => {
    const mentions = buildPublicationMentions(pve({ accessMode: 'USERS' }), 'Evento publicado automaticamente');
    expect(mentions).toMatchObject({ content: 'Evento publicado automaticamente', allowedMentions: { parse: [] } });
  });
});

describe('core: acceso PvE — descripcion para los paneles', () => {
  it('explica cada modo y que pasa con quien no tiene acceso', () => {
    expect(describePveAccess(pve()).title).toBe('Abierto');
    const roles = describePveAccess(pve({ accessMode: 'ROLES', allowedRoleIds: ['r1'] }));
    expect(roles.title).toBe('Por roles');
    expect(roles.targets).toBe('<@&r1>');
    expect(roles.help).toContain('filler');
    const users = describePveAccess(pve({ accessMode: 'USERS', allowedUserIds: ['u1', 'u2'] }));
    expect(users.title).toBe('Por personas');
    expect(users.targets).toBe('<@u1> <@u2>');
    expect(describePveAccess(pve({ accessMode: 'USERS' })).targets).toBe('Nadie seleccionado: todos quedaran como fillers');
  });
});
