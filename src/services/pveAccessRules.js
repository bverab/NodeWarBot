// Reglas puras del acceso a eventos PvE: quien entra como titular, a quien se menciona al publicar y
// como se describe cada modo. Sin Discord ni base de datos: tambien las usa el dashboard.
//   OPEN  -> cualquiera se inscribe como titular.
//   ROLES -> titular quien tenga alguno de los roles permitidos; el resto queda como filler.
//   USERS -> titular solo quien este en la lista de personas; el resto queda como filler.
// 'RESTRICTED' es el nombre antiguo de USERS y se sigue leyendo asi.
const ACCESS_MODES = ['OPEN', 'ROLES', 'USERS'];
const MAX_ACCESS_ENTRIES = 25;

function normalizeAccessMode(value) {
  const mode = String(value || 'OPEN').toUpperCase();
  if (mode === 'RESTRICTED') return 'USERS';
  return ACCESS_MODES.includes(mode) ? mode : 'OPEN';
}

function normalizeIds(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean)));
}

function isPveEvent(event) {
  return String(event?.eventType || '').toLowerCase() === 'pve';
}

// @everyone es el rol con el id del servidor: no da acceso ni se menciona, aunque haya quedado guardado.
function withoutEveryone(event, roleIds) {
  return normalizeIds(roleIds).filter(roleId => roleId !== String(event?.guildId));
}

// GuildMember de discord.js (roles.cache) o miembro crudo de la interaccion (roles: string[]).
function getMemberRoleIds(member) {
  if (Array.isArray(member?.roles)) return normalizeIds(member.roles);
  const cache = member?.roles?.cache;
  return cache && typeof cache.keys === 'function' ? normalizeIds(Array.from(cache.keys())) : [];
}

function hasPveAccess(event, { userId, userRoleIds = [] } = {}) {
  const mode = normalizeAccessMode(event?.accessMode);
  if (mode === 'USERS') return normalizeIds(event?.allowedUserIds).includes(String(userId));
  if (mode === 'ROLES') {
    const allowed = new Set(withoutEveryone(event, event?.allowedRoleIds));
    return normalizeIds(userRoleIds).some(roleId => allowed.has(roleId));
  }
  return true;
}

// PvE por personas menciona a las personas; PvE por roles, a los roles permitidos; el resto, a notifyRoles.
function getPublicationTargets(event) {
  const mode = isPveEvent(event) ? normalizeAccessMode(event?.accessMode) : 'OPEN';
  if (mode === 'USERS') return { type: 'users', ids: normalizeIds(event?.allowedUserIds) };
  if (mode === 'ROLES') return { type: 'roles', ids: withoutEveryone(event, event?.allowedRoleIds) };
  return { type: 'roles', ids: withoutEveryone(event, event?.notifyRoles) };
}

function formatMentions(type, ids) {
  return ids.map(id => (type === 'users' ? `<@${id}>` : `<@&${id}>`)).join(' ');
}

function buildPublicationMentions(event, fallbackContent) {
  const { type, ids } = getPublicationTargets(event);
  if (ids.length === 0) {
    return { targetType: type, targets: [], content: fallbackContent, allowedMentions: { parse: [] } };
  }
  return {
    targetType: type,
    targets: ids,
    content: formatMentions(type, ids),
    allowedMentions: type === 'users' ? { parse: [], users: ids } : { parse: [], roles: ids }
  };
}

const MODE_TEXT = {
  OPEN: {
    title: 'Abierto',
    help: 'Cualquiera que marque un horario queda como titular.'
  },
  ROLES: {
    title: 'Por roles',
    help: 'Quien tenga alguno de estos roles queda como titular. El resto queda como filler (lista de espera): si al cierre ningun horario se lleno, completan el horario mas temprano posible por orden de llegada.'
  },
  USERS: {
    title: 'Por personas',
    help: 'Solo estas personas quedan como titulares y se mencionan al publicar. El resto queda como filler (lista de espera): si al cierre ningun horario se lleno, completan el horario mas temprano posible por orden de llegada.'
  }
};

function describePveAccess(event) {
  const mode = normalizeAccessMode(event?.accessMode);
  const text = MODE_TEXT[mode];
  let targets = 'Sin restriccion';
  if (mode === 'ROLES') {
    const ids = withoutEveryone(event, event?.allowedRoleIds);
    targets = ids.length ? formatMentions('roles', ids) : 'Ningun rol seleccionado: todos quedaran como fillers';
  } else if (mode === 'USERS') {
    const ids = normalizeIds(event?.allowedUserIds);
    targets = ids.length ? formatMentions('users', ids) : 'Nadie seleccionado: todos quedaran como fillers';
  }
  return { mode, title: text.title, help: text.help, targets };
}

module.exports = {
  ACCESS_MODES,
  MAX_ACCESS_ENTRIES,
  normalizeAccessMode,
  normalizeIds,
  getMemberRoleIds,
  hasPveAccess,
  buildPublicationMentions,
  describePveAccess
};
