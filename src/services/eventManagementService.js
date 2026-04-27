const { normalizeEventType } = require('../constants/eventTypes');
const warService = require('./warService');
const pveService = require('./pveService');

// Dashboard-ready event operations.
// These functions accept IDs and plain data instead of Discord interactions, so
// they can be called later from an HTTP API while Discord handlers stay thin.

function listEvents(filter = {}) {
  return warService.loadWars().filter(event => {
    if (filter.channelId && String(event.channelId || '') !== String(filter.channelId)) return false;
    if (filter.guildId && String(event.guildId || '') !== String(filter.guildId)) return false;
    if (filter.eventType && normalizeEventType(event.eventType) !== normalizeEventType(filter.eventType)) return false;
    return true;
  });
}

function getEventById(eventId, filter = {}) {
  return listEvents(filter).find(event => String(event.id) === String(eventId)) || null;
}

async function createEvent(eventInput, options = {}) {
  const created = await warService.createWar(eventInput);
  if (normalizeEventType(created.eventType) === 'pve' && Array.isArray(options.pveSlots)) {
    await pveService.saveEventSlots(created.id, options.pveSlots);
  }
  return await getEventDashboardView(created.id);
}

async function updateEvent(eventId, patch = {}, filter = {}) {
  const current = getEventById(eventId, filter);
  if (!current) return { ok: false, reason: 'event_missing' };

  const updated = await warService.updateWar({
    ...current,
    ...patch,
    id: current.id
  });

  return { ok: true, event: updated };
}

async function setEventClosed(eventId, isClosed, filter = {}) {
  return await updateEvent(eventId, { isClosed: Boolean(isClosed) }, filter);
}

async function toggleEventClosed(eventId, filter = {}) {
  const current = getEventById(eventId, filter);
  if (!current) return { ok: false, reason: 'event_missing' };
  return await setEventClosed(current.id, !current.isClosed, filter);
}

async function getEventDashboardView(eventId, filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };

  if (normalizeEventType(event.eventType) !== 'pve') {
    return { ok: true, event };
  }

  const pve = await pveService.getEventPveView(event);
  return { ok: true, event, pve };
}

async function updatePveAllowedUsers(eventId, accessMode, allowedUserIds = [], filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };
  if (normalizeEventType(event.eventType) !== 'pve') return { ok: false, reason: 'not_pve' };

  const updated = await pveService.configureAccess(event.id, accessMode, allowedUserIds);
  return { ok: true, event: updated };
}

async function addPveSlot(eventId, time, capacity, filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };
  if (normalizeEventType(event.eventType) !== 'pve') return { ok: false, reason: 'not_pve' };

  await pveService.addSlot(event.id, time, capacity);
  return await getEventDashboardView(event.id, filter);
}

async function updatePveSlot(eventId, optionId, updates = {}, filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };
  if (normalizeEventType(event.eventType) !== 'pve') return { ok: false, reason: 'not_pve' };

  await pveService.editSlot(optionId, updates);
  return await getEventDashboardView(event.id, filter);
}

async function deletePveSlot(eventId, optionId, filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };
  if (normalizeEventType(event.eventType) !== 'pve') return { ok: false, reason: 'not_pve' };

  const deleted = await pveService.deleteSlot(event.id, optionId);
  const view = await getEventDashboardView(event.id, filter);
  return { ...view, deleted };
}

async function movePveSlot(eventId, optionId, direction, filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };
  if (normalizeEventType(event.eventType) !== 'pve') return { ok: false, reason: 'not_pve' };

  const moved = await pveService.moveSlot(event.id, optionId, direction);
  const view = await getEventDashboardView(event.id, filter);
  return { ...view, moved };
}

async function addPveEnrollment(eventId, optionId, participant, enrollmentType = 'PRIMARY', filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };
  if (normalizeEventType(event.eventType) !== 'pve') return { ok: false, reason: 'not_pve' };

  const result = await pveService.adminAddEnrollment(event.id, optionId, participant, enrollmentType);
  const view = await getEventDashboardView(event.id, filter);
  return { ...view, result };
}

async function removePveEnrollment(eventId, optionId, userId, filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };
  if (normalizeEventType(event.eventType) !== 'pve') return { ok: false, reason: 'not_pve' };

  const removed = await pveService.removeEnrollment(event.id, optionId, userId);
  const view = await getEventDashboardView(event.id, filter);
  return { ...view, removed };
}

async function movePveEnrollment(eventId, fromOptionId, toOptionId, userId, filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };
  if (normalizeEventType(event.eventType) !== 'pve') return { ok: false, reason: 'not_pve' };

  const result = await pveService.moveEnrollment(event.id, fromOptionId, toOptionId, userId);
  const view = await getEventDashboardView(event.id, filter);
  return { ...view, result };
}

async function promotePveFiller(eventId, optionId, userId, filter = {}) {
  const event = getEventById(eventId, filter);
  if (!event) return { ok: false, reason: 'event_missing' };
  if (normalizeEventType(event.eventType) !== 'pve') return { ok: false, reason: 'not_pve' };

  const result = await pveService.promoteFiller(event.id, optionId, userId);
  const view = await getEventDashboardView(event.id, filter);
  return { ...view, result };
}

module.exports = {
  listEvents,
  getEventById,
  createEvent,
  updateEvent,
  setEventClosed,
  toggleEventClosed,
  getEventDashboardView,
  updatePveAllowedUsers,
  addPveSlot,
  updatePveSlot,
  deletePveSlot,
  movePveSlot,
  addPveEnrollment,
  removePveEnrollment,
  movePveEnrollment,
  promotePveFiller
};
