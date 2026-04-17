const EMPTY_SLOT = '-- vacio --';
const { normalizeEventType } = require('../constants/eventTypes');

function toParticipant(entry) {
  if (!entry) return null;

  if (typeof entry === 'object' && entry.userId) {
    return {
      userId: String(entry.userId),
      displayName: entry.displayName || entry.userName || 'Usuario',
      isFake: Boolean(entry.isFake) || String(entry.userId).startsWith('fake_')
    };
  }

  if (typeof entry !== 'string') return null;

  if (entry.includes('|')) {
    const [displayName, userId] = entry.split('|');
    if (!userId) return null;

    return {
      userId: userId.trim(),
      displayName: (displayName || 'Usuario').trim(),
      isFake: userId.trim().startsWith('fake_')
    };
  }

  const fakeMatch = entry.match(/^(.*)\(([^()]+)\)$/);
  if (fakeMatch) {
    const displayName = fakeMatch[1].trim();
    const userId = fakeMatch[2].trim();

    return {
      userId,
      displayName: displayName || 'Usuario',
      isFake: true
    };
  }

  return {
    userId: entry,
    displayName: 'Usuario',
    isFake: String(entry).startsWith('fake_')
  };
}

function normalizeRole(role = {}) {
  const users = Array.isArray(role.users)
    ? role.users.map(toParticipant).filter(Boolean)
    : [];

  return {
    name: (role.name || 'Rol').trim(),
    max: Number.isInteger(role.max) && role.max > 0 ? role.max : 1,
    emoji: role.emoji || null,
    users,
    allowedRoleIds: Array.isArray(role.allowedRoleIds) ? role.allowedRoleIds.map(String) : [],
    allowedRoles: Array.isArray(role.allowedRoles) ? role.allowedRoles : []
  };
}

function normalizeWaitlistEntry(entry = {}) {
  if (!entry.userId) return null;

  return {
    userId: String(entry.userId),
    userName: entry.userName || entry.displayName || 'Usuario',
    roleName: entry.roleName || null,
    joinedAt: Number.isFinite(entry.joinedAt) ? entry.joinedAt : Date.now(),
    isFake: Boolean(entry.isFake) || String(entry.userId).startsWith('fake_')
  };
}

function normalizeWar(war = {}) {
  const createdAt = Number.isFinite(war.createdAt) ? war.createdAt : deriveCreatedAt(war.id);
  const duration = Number.isFinite(war.duration) && war.duration > 0 ? war.duration : 70;
  const closesAt = Number.isFinite(war.closesAt) ? war.closesAt : createdAt + duration * 60 * 1000;

  return {
    // Identificación básica
    id: String(war.id || Date.now()),
    groupId: war.groupId || null,                    // NUEVO: grupo de eventos relacionados
    eventType: normalizeEventType(war.eventType || 'war'),
    name: war.name || 'Node War',
    type: war.type || 'Sin descripcion',
    
    // Contenido
    roles: Array.isArray(war.roles) ? war.roles.map(normalizeRole) : [],
    waitlist: Array.isArray(war.waitlist) ? war.waitlist.map(normalizeWaitlistEntry).filter(Boolean) : [],
    
    // Discord
    creatorId: war.creatorId || null,
    channelId: war.channelId || null,
    messageId: war.messageId || null,
    
    // Scheduling (NUEVO)
    dayOfWeek: war.dayOfWeek !== undefined ? Number(war.dayOfWeek) : null,  // 0-6
    time: war.time || null,                         // "HH:mm"
    timezone: war.timezone || 'America/Bogota',
    duration,                                       // minutos
    notifyRoles: Array.isArray(war.notifyRoles) ? war.notifyRoles : [],  // Array de role IDs o user IDs
    
    // Control de automatización (NUEVO)
    schedule: normalizeSchedule(war.schedule),
    
    // Timestamps
    createdAt,
    closesAt,
    isClosed: Boolean(war.isClosed)
  };
}

/**
 * Normaliza configuración de schedule
 */
function normalizeSchedule(schedule = {}) {
  return {
    enabled: Boolean(schedule.enabled),
    mode: schedule.mode === 'once' ? 'once' : 'recurring',
    lastCreatedAt: schedule.lastCreatedAt || null,
    lastMessageIdDeleted: schedule.lastMessageIdDeleted || null
  };
}

function deriveCreatedAt(id) {
  if (id === undefined || id === null) return Date.now();

  const parsed = Number.parseInt(String(id), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return Date.now();
}

function getRoleByName(war, roleName) {
  return war.roles.find(role => role.name === roleName);
}

function findParticipantRole(war, userId) {
  return war.roles.find(role => role.users.some(user => user.userId === userId)) || null;
}

function removeParticipantFromAllRoles(war, userId) {
  let removedRoles = 0;

  war.roles.forEach(role => {
    const before = role.users.length;
    role.users = role.users.filter(user => user.userId !== userId);
    if (role.users.length < before) {
      removedRoles += 1;
    }
  });

  return removedRoles;
}

function addParticipantToRole(role, participant) {
  if (role.users.some(user => user.userId === participant.userId)) {
    return false;
  }

  role.users.push(participant);
  return true;
}

function upsertWaitlistEntry(war, waitlistEntry) {
  if (war.waitlist.some(entry => entry.userId === waitlistEntry.userId)) {
    return false;
  }

  war.waitlist.push(waitlistEntry);
  return true;
}

function removeFromWaitlist(war, userId) {
  const before = war.waitlist.length;
  war.waitlist = war.waitlist.filter(entry => entry.userId !== userId);
  return war.waitlist.length < before;
}

function pickWaitlistForRole(war, roleName) {
  if (!war.waitlist.length) return null;

  const targetedIndex = war.waitlist.findIndex(entry => entry.roleName === roleName);
  if (targetedIndex < 0) return null;

  const [entry] = war.waitlist.splice(targetedIndex, 1);
  return entry || null;
}

function getWarTotals(war) {
  const totalSlots = war.roles.reduce((acc, role) => acc + role.max, 0);
  const totalSigned = war.roles.reduce((acc, role) => acc + role.users.length, 0);

  return { totalSlots, totalSigned };
}

function formatMemberList(role) {
  if (!role.users.length) return EMPTY_SLOT;
  return role.users.map(user => `_${user.displayName}_`).join('\n');
}

function getFakeUserIdFromName(name) {
  const safe = name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return `fake_${safe || Date.now()}`;
}

module.exports = {
  EMPTY_SLOT,
  toParticipant,
  normalizeWar,
  getRoleByName,
  findParticipantRole,
  removeParticipantFromAllRoles,
  addParticipantToRole,
  upsertWaitlistEntry,
  removeFromWaitlist,
  pickWaitlistForRole,
  getWarTotals,
  formatMemberList,
  getFakeUserIdFromName
};
