const { prisma } = require('./client');
const { normalizeWar } = require('../utils/warState');
const { logInfo } = require('./logger');

let warsCache = [];
let initialized = false;
let globalWriteLock = Promise.resolve();
const eventLocks = new Map();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toDate(ms) {
  const timestamp = Number(ms);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date();
}

function toNumber(date) {
  if (!date) return null;
  const parsed = date instanceof Date ? date.getTime() : Number(date);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWarsInput(wars) {
  return Array.isArray(wars) ? wars.map(normalizeWar) : [];
}

async function ensureGuildIfNeeded(tx, guildId) {
  if (!guildId) return;
  await tx.guild.upsert({
    where: { id: String(guildId) },
    update: {},
    create: { id: String(guildId) }
  });
}

async function replaceWarChildren(tx, eventId) {
  await tx.eventParticipant.deleteMany({
    where: { eventId }
  });
  await tx.eventRolePermission.deleteMany({
    where: { roleSlot: { eventId } }
  });
  await tx.eventRoleSlot.deleteMany({
    where: { eventId }
  });
  await tx.eventWaitlistEntry.deleteMany({
    where: { eventId }
  });
  await tx.eventNotifyTarget.deleteMany({
    where: { eventId }
  });
  await tx.eventSchedule.deleteMany({
    where: { eventId }
  });
  await tx.eventRecapConfig.deleteMany({
    where: { eventId }
  });
  await tx.eventAccessRole.deleteMany({
    where: { eventId }
  });
  await tx.eventAccessUser.deleteMany({
    where: { eventId }
  });
  await tx.eventFillerEntry.deleteMany({
    where: { eventId }
  });
}

async function upsertWarTx(tx, warInput) {
  const war = normalizeWar(warInput);
  await ensureGuildIfNeeded(tx, war.guildId);

  await tx.event.upsert({
    where: { id: war.id },
    create: {
      id: war.id,
      groupId: war.groupId,
      eventType: war.eventType,
      accessMode: war.accessMode,
      name: war.name,
      type: war.type,
      classIconSource: war.classIconSource,
      participantDisplayStyle: war.participantDisplayStyle,
      creatorId: war.creatorId,
      guildId: war.guildId,
      channelId: war.channelId,
      messageId: war.messageId,
      dayOfWeek: war.dayOfWeek,
      time: war.time,
      timezone: war.timezone,
      duration: war.duration,
      closeBeforeMinutes: war.closeBeforeMinutes,
      createdAt: toDate(war.createdAt),
      expiresAt: toDate(war.expiresAt),
      closesAt: toDate(war.closesAt),
      isClosed: Boolean(war.isClosed)
    },
    update: {
      groupId: war.groupId,
      eventType: war.eventType,
      accessMode: war.accessMode,
      name: war.name,
      type: war.type,
      classIconSource: war.classIconSource,
      participantDisplayStyle: war.participantDisplayStyle,
      creatorId: war.creatorId,
      guildId: war.guildId,
      channelId: war.channelId,
      messageId: war.messageId,
      dayOfWeek: war.dayOfWeek,
      time: war.time,
      timezone: war.timezone,
      duration: war.duration,
      closeBeforeMinutes: war.closeBeforeMinutes,
      createdAt: toDate(war.createdAt),
      expiresAt: toDate(war.expiresAt),
      closesAt: toDate(war.closesAt),
      isClosed: Boolean(war.isClosed)
    }
  });

  await replaceWarChildren(tx, war.id);

  for (let roleIndex = 0; roleIndex < war.roles.length; roleIndex += 1) {
    const role = war.roles[roleIndex];
    const createdRole = await tx.eventRoleSlot.create({
      data: {
        eventId: war.id,
        position: roleIndex,
        name: role.name,
        max: role.max,
        emoji: role.emoji || null,
        emojiSource: role.emojiSource || null
      }
    });

    const dedupRoleIds = Array.from(new Set((role.allowedRoleIds || []).map(String).filter(Boolean)));
    const dedupRoleNames = Array.from(new Set((role.allowedRoles || []).map(String).filter(Boolean)));

    for (const allowedRoleId of dedupRoleIds) {
      await tx.eventRolePermission.create({
        data: {
          roleSlotId: createdRole.id,
          discordRoleId: allowedRoleId,
          discordRoleName: null
        }
      });
    }

    for (const allowedRoleName of dedupRoleNames) {
      await tx.eventRolePermission.create({
        data: {
          roleSlotId: createdRole.id,
          discordRoleId: null,
          discordRoleName: allowedRoleName
        }
      });
    }

    for (const user of role.users || []) {
      await tx.eventParticipant.create({
        data: {
          eventId: war.id,
          roleSlotId: createdRole.id,
          userId: String(user.userId),
          displayName: String(user.displayName || 'Usuario'),
          isFake: Boolean(user.isFake),
          joinedAt: new Date()
        }
      });
    }
  }

  for (let index = 0; index < war.waitlist.length; index += 1) {
    const entry = war.waitlist[index];
    await tx.eventWaitlistEntry.create({
      data: {
        eventId: war.id,
        position: index,
        userId: String(entry.userId),
        userName: String(entry.userName || entry.displayName || 'Usuario'),
        roleName: entry.roleName || null,
        joinedAt: toDate(entry.joinedAt),
        isFake: Boolean(entry.isFake)
      }
    });
  }

  const notifyTargets = Array.from(new Set((war.notifyRoles || []).map(String).filter(Boolean)));
  for (let index = 0; index < notifyTargets.length; index += 1) {
    await tx.eventNotifyTarget.create({
      data: {
        eventId: war.id,
        targetId: notifyTargets[index],
        position: index
      }
    });
  }

  const allowedRoleIds = Array.from(new Set((war.allowedRoleIds || []).map(String).filter(Boolean)));
  for (let index = 0; index < allowedRoleIds.length; index += 1) {
    await tx.eventAccessRole.create({
      data: {
        eventId: war.id,
        roleId: allowedRoleIds[index],
        position: index
      }
    });
  }

  const allowedUserIds = Array.from(new Set((war.allowedUserIds || []).map(String).filter(Boolean)));
  for (let index = 0; index < allowedUserIds.length; index += 1) {
    await tx.eventAccessUser.create({
      data: {
        eventId: war.id,
        userId: allowedUserIds[index],
        position: index
      }
    });
  }

  for (const filler of war.fillers || []) {
    if (!filler?.userId) continue;
    await tx.eventFillerEntry.create({
      data: {
        eventId: war.id,
        userId: String(filler.userId),
        displayName: String(filler.displayName || filler.userName || 'Usuario'),
        isFake: Boolean(filler.isFake),
        joinedAt: filler.joinedAt ? toDate(filler.joinedAt) : new Date()
      }
    });
  }

  await tx.eventSchedule.create({
    data: {
      eventId: war.id,
      enabled: Boolean(war.schedule?.enabled),
      mode: war.schedule?.mode === 'once' ? 'once' : 'recurring',
      lastCreatedAt: war.schedule?.lastCreatedAt ? toDate(war.schedule.lastCreatedAt) : null,
      lastMessageIdDeleted: war.schedule?.lastMessageIdDeleted ? toDate(war.schedule.lastMessageIdDeleted) : null
    }
  });

  await tx.eventRecapConfig.create({
    data: {
      eventId: war.id,
      enabled: Boolean(war.recap?.enabled),
      minutesBeforeExpire: Number.isFinite(war.recap?.minutesBeforeExpire) ? war.recap.minutesBeforeExpire : 0,
      messageText: String(war.recap?.messageText || ''),
      threadId: war.recap?.threadId || null,
      lastPostedAt: war.recap?.lastPostedAt ? toDate(war.recap.lastPostedAt) : null
    }
  });
}

function mapDbEventToDomain(event) {
  const roles = event.roleSlots.map(slot => ({
    name: slot.name,
    max: slot.max,
    emoji: slot.emoji || null,
    emojiSource: slot.emojiSource || null,
    users: slot.users.map(user => ({
      userId: user.userId,
      displayName: user.displayName,
      isFake: Boolean(user.isFake)
    })),
    allowedRoleIds: slot.permissions.map(permission => permission.discordRoleId).filter(Boolean),
    allowedRoles: slot.permissions.map(permission => permission.discordRoleName).filter(Boolean)
  }));

  return normalizeWar({
    id: event.id,
    groupId: event.groupId,
    eventType: event.eventType,
    accessMode: event.accessMode,
    name: event.name,
    type: event.type,
    classIconSource: event.classIconSource,
    participantDisplayStyle: event.participantDisplayStyle,
    roles,
    waitlist: event.waitlist.map(entry => ({
      userId: entry.userId,
      userName: entry.userName,
      roleName: entry.roleName,
      joinedAt: toNumber(entry.joinedAt),
      isFake: Boolean(entry.isFake)
    })),
    creatorId: event.creatorId,
    guildId: event.guildId,
    channelId: event.channelId,
    messageId: event.messageId,
    dayOfWeek: event.dayOfWeek,
    time: event.time,
    timezone: event.timezone,
    duration: event.duration,
    closeBeforeMinutes: event.closeBeforeMinutes,
    notifyRoles: event.notifyTargets.map(target => target.targetId),
    allowedUserIds: event.accessUsers.map(user => user.userId),
    allowedRoleIds: event.accessRoles.map(role => role.roleId),
    fillers: event.fillers.map(entry => ({
      userId: entry.userId,
      displayName: entry.displayName,
      isFake: Boolean(entry.isFake),
      joinedAt: toNumber(entry.joinedAt)
    })),
    schedule: {
      enabled: Boolean(event.schedule?.enabled),
      mode: event.schedule?.mode === 'once' ? 'once' : 'recurring',
      lastCreatedAt: toNumber(event.schedule?.lastCreatedAt),
      lastMessageIdDeleted: toNumber(event.schedule?.lastMessageIdDeleted)
    },
    recap: {
      enabled: Boolean(event.recap?.enabled),
      minutesBeforeExpire: Number.isFinite(event.recap?.minutesBeforeExpire) ? event.recap.minutesBeforeExpire : 0,
      messageText: String(event.recap?.messageText || ''),
      threadId: event.recap?.threadId || null,
      lastPostedAt: toNumber(event.recap?.lastPostedAt)
    },
    createdAt: toNumber(event.createdAt),
    expiresAt: toNumber(event.expiresAt),
    closesAt: toNumber(event.closesAt),
    isClosed: Boolean(event.isClosed)
  });
}

async function readWarsFromSqlite() {
  const events = await prisma.event.findMany({
    include: {
      roleSlots: {
        include: {
          users: true,
          permissions: true
        },
        orderBy: { position: 'asc' }
      },
      waitlist: {
        orderBy: { position: 'asc' }
      },
      notifyTargets: {
        orderBy: { position: 'asc' }
      },
      accessRoles: {
        orderBy: { position: 'asc' }
      },
      accessUsers: {
        orderBy: { position: 'asc' }
      },
      fillers: {
        orderBy: { joinedAt: 'asc' }
      },
      schedule: true,
      recap: true
    },
    orderBy: { createdAt: 'asc' }
  });

  return events.map(mapDbEventToDomain);
}

async function replaceAllWarsInSqlite(warsInput) {
  const wars = normalizeWarsInput(warsInput);
  await prisma.$transaction(async tx => {
    await tx.eventParticipant.deleteMany();
    await tx.eventRolePermission.deleteMany();
    await tx.eventRoleSlot.deleteMany();
    await tx.eventWaitlistEntry.deleteMany();
    await tx.eventNotifyTarget.deleteMany();
    await tx.eventAccessRole.deleteMany();
    await tx.eventAccessUser.deleteMany();
    await tx.eventFillerEntry.deleteMany();
    await tx.eventSchedule.deleteMany();
    await tx.eventRecapConfig.deleteMany();
    await tx.event.deleteMany();
    for (const war of wars) {
      await upsertWarTx(tx, war);
    }
  });
}

async function persistSingleWarToSqlite(warInput) {
  await prisma.$transaction(async tx => {
    await upsertWarTx(tx, warInput);
  });
}

async function deleteWarFromSqliteByMessageId(messageId) {
  const event = await prisma.event.findUnique({
    where: { messageId: String(messageId) },
    select: { id: true }
  });
  if (!event) return false;
  await prisma.event.delete({
    where: { id: event.id }
  });
  return true;
}

function withGlobalWriteLock(task) {
  const next = globalWriteLock.then(task);
  globalWriteLock = next.catch(() => null);
  return next;
}

function withEventLock(eventId, task) {
  const key = String(eventId);
  const previous = eventLocks.get(key) || Promise.resolve();
  const guard = previous.catch(() => null);
  const next = guard.then(task);
  eventLocks.set(key, next);
  return next.finally(() => {
    if (eventLocks.get(key) === next) {
      eventLocks.delete(key);
    }
  });
}

async function initializeWarRepository() {
  if (initialized) return;
  warsCache = normalizeWarsInput(await readWarsFromSqlite());
  initialized = true;
  logInfo(`WarRepository inicializado con ${warsCache.length} evento(s).`);
}

function loadWars() {
  return deepClone(warsCache).map(normalizeWar);
}

async function saveWars(wars) {
  const normalized = normalizeWarsInput(wars);
  await withGlobalWriteLock(async () => {
    await replaceAllWarsInSqlite(normalized);
    warsCache = normalized;
  });
}

async function createWar(warData) {
  const war = normalizeWar(warData);
  await withEventLock(war.id, async () => {
    await persistSingleWarToSqlite(war);
    const index = warsCache.findIndex(entry => entry.id === war.id);
    if (index >= 0) warsCache[index] = war;
    else warsCache.push(war);
  });
  return war;
}

function getWarByMessageId(messageId) {
  const value = String(messageId);
  return loadWars().find(war => war.messageId === value) || null;
}

function getLatestWarByChannelId(channelId) {
  const wars = loadWars().filter(war => war.channelId === channelId);
  if (!wars.length) return null;
  wars.sort((a, b) => b.createdAt - a.createdAt);
  return wars[0];
}

async function updateWar(updatedWar) {
  const normalized = normalizeWar(updatedWar);
  await withEventLock(normalized.id, async () => {
    await persistSingleWarToSqlite(normalized);
    const index = warsCache.findIndex(war => war.id === normalized.id);
    if (index >= 0) warsCache[index] = normalized;
    else warsCache.push(normalized);
  });
  return normalized;
}

async function updateWarByMessageId(messageId, updater) {
  const value = String(messageId);
  const initial = warsCache.find(war => war.messageId === value);
  if (!initial) return { war: null, result: null };

  let normalized = null;
  let result = null;

  await withEventLock(initial.id, async () => {
    const current = warsCache.find(war => war.messageId === value);
    if (!current) return;

    const draft = normalizeWar(current);
    result = updater(draft);
    normalized = normalizeWar(draft);

    await persistSingleWarToSqlite(normalized);
    const index = warsCache.findIndex(war => war.id === normalized.id);
    if (index >= 0) warsCache[index] = normalized;
    else warsCache.push(normalized);
  });

  if (!normalized) return { war: null, result: null };
  return { war: normalized, result };
}

async function deleteWarByMessageId(messageId) {
  const value = String(messageId);
  const initial = warsCache.find(war => war.messageId === value);
  if (!initial) return false;

  let deleted = false;
  await withEventLock(initial.id, async () => {
    deleted = await deleteWarFromSqliteByMessageId(value);
    if (deleted) {
      warsCache = warsCache.filter(war => war.messageId !== value);
    }
  });
  return deleted;
}

function getWarsByGroupId(groupId) {
  return loadWars().filter(war => war.groupId === groupId);
}

function getWarByGroupAndDay(groupId, dayOfWeek) {
  return loadWars().find(war => war.groupId === groupId && war.dayOfWeek === dayOfWeek) || null;
}

function searchWarsByName(searchTerm) {
  const term = String(searchTerm || '').toLowerCase();
  const seen = new Set();
  return loadWars().filter(war => {
    if (seen.has(war.groupId)) return false;
    if (!war.name?.toLowerCase().includes(term) && !war.groupId?.toLowerCase().includes(term)) return false;
    seen.add(war.groupId);
    return true;
  });
}

function getEditableWarsForAutocomplete() {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  return loadWars()
    .filter(war => war.name && war.dayOfWeek !== undefined && war.dayOfWeek !== null)
    .map(war => ({
      groupId: war.groupId,
      id: war.id,
      dayOfWeek: war.dayOfWeek,
      name: war.name,
      displayName: `${war.name} - ${days[war.dayOfWeek] || 'Desconocido'}`,
      time: war.time
    }));
}

async function waitForWarRepositoryIdle() {
  await globalWriteLock;
  await Promise.all(Array.from(eventLocks.values()).map(promise => promise.catch(() => null)));
}

function __resetWarRepositoryForTests() {
  warsCache = [];
  initialized = false;
  globalWriteLock = Promise.resolve();
  eventLocks.clear();
}

module.exports = {
  initializeWarRepository,
  waitForWarRepositoryIdle,
  readWarsFromSqlite,
  replaceAllWarsInSqlite,
  loadWars,
  saveWars,
  createWar,
  getWarByMessageId,
  getLatestWarByChannelId,
  updateWar,
  updateWarByMessageId,
  deleteWarByMessageId,
  getWarsByGroupId,
  getWarByGroupAndDay,
  searchWarsByName,
  getEditableWarsForAutocomplete,
  __resetWarRepositoryForTests
};
