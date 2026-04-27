const { normalizeEventType } = require('../constants/eventTypes');
const eventOptionRepository = require('../db/eventOptionRepository');
const warService = require('./warService');
const { sanitizeDisplayText } = require('../utils/textSafety');

function parsePveSlotsInput(rawTimes, rawCapacity) {
  const timesText = String(rawTimes || '').trim();
  const capacity = Number.parseInt(String(rawCapacity || '').trim(), 10);

  if (!timesText) {
    throw new Error('Debes ingresar al menos un horario.');
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    throw new Error('El cupo debe ser un numero entre 1 y 500.');
  }

  const tokens = timesText
    .split(';')
    .map(token => token.trim())
    .filter(Boolean);

  if (!tokens.length) {
    throw new Error('Debes ingresar al menos un horario valido.');
  }

  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(token)) {
      throw new Error(`Horario invalido: ${token}. Usa HH:mm separado por ';'.`);
    }
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
  }

  if (!unique.length) {
    throw new Error('Debes ingresar al menos un horario valido.');
  }

  return {
    slotCapacity: capacity,
    timeSlots: unique.map((time, index) => ({
      position: index,
      label: time,
      time,
      capacity
    }))
  };
}

function ensurePveEventType(event) {
  return normalizeEventType(event?.eventType) === 'pve';
}

function normalizeAccessMode(value) {
  return String(value || 'OPEN').toUpperCase() === 'RESTRICTED' ? 'RESTRICTED' : 'OPEN';
}

function normalizeAllowedUserIds(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean)));
}

async function saveEventSlots(eventId, timeSlots) {
  await eventOptionRepository.replaceEventOptions(eventId, timeSlots);
}

async function getEventSlots(eventId) {
  return await eventOptionRepository.listEventOptionsWithEnrollments(eventId);
}

async function joinSlot(eventId, optionId, participant) {
  const event = warService.loadWars().find(entry => entry.id === String(eventId));
  if (!event) return { ok: false, reason: 'event_missing' };

  const options = await getEventSlots(eventId);
  const targetOption = options.find(option => option.id === String(optionId));
  if (!targetOption) return { ok: false, reason: 'option_missing' };

  const existing = (targetOption.enrollments || []).find(
    enrollment => String(enrollment.userId) === String(participant.userId)
  );

  if (existing) {
    const removed = await eventOptionRepository.removeEventEnrollment(
      eventId,
      optionId,
      participant.userId
    );
    return { ok: removed, reason: removed ? 'left' : 'leave_failed' };
  }

  const accessMode = normalizeAccessMode(event.accessMode);
  const allowedUserIds = normalizeAllowedUserIds(event.allowedUserIds);
  const hasAccess = accessMode === 'OPEN' || allowedUserIds.includes(String(participant.userId));
  const enrollmentType = hasAccess ? 'PRIMARY' : 'FILLER';

  return await eventOptionRepository.joinEventOption({
    eventId,
    optionId,
    userId: participant.userId,
    displayName: sanitizeDisplayText(participant.displayName, { maxLength: 64, fallback: 'Usuario' }),
    isFake: Boolean(participant.isFake),
    enrollmentType
  });
}

async function leaveSlot(eventId, userId, optionId = null) {
  return await eventOptionRepository.leaveEventParticipation(eventId, userId, optionId);
}

async function resetEventEnrollments(eventId) {
  await eventOptionRepository.clearEventEnrollments(eventId);
}

async function cloneSlots(sourceEventId, targetEventId) {
  await eventOptionRepository.cloneEventOptions(sourceEventId, targetEventId);
}

async function addSlot(eventId, time, capacity) {
  const timeValue = String(time || '').trim();
  const capacityValue = Number.parseInt(String(capacity), 10);
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(timeValue)) {
    throw new Error('Horario invalido. Usa HH:mm.');
  }
  if (!Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 500) {
    throw new Error('Cupo invalido. Debe ser entre 1 y 500.');
  }

  await eventOptionRepository.addEventOption(eventId, {
    time: timeValue,
    label: timeValue,
    capacity: capacityValue
  });
}

async function editSlot(optionId, updates = {}) {
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'time')) {
    const timeValue = String(updates.time || '').trim();
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(timeValue)) {
      throw new Error('Horario invalido. Usa HH:mm.');
    }
    payload.time = timeValue;
    payload.label = timeValue;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'capacity')) {
    payload.capacity = Number.parseInt(String(updates.capacity), 10);
  }
  await eventOptionRepository.updateEventOption(optionId, payload);
}

async function deleteSlot(eventId, optionId) {
  return await eventOptionRepository.deleteEventOption(eventId, optionId);
}

async function moveSlot(eventId, optionId, direction) {
  return await eventOptionRepository.moveEventOption(eventId, optionId, direction);
}

async function configureAccess(eventId, accessMode, allowedUserIds = []) {
  await eventOptionRepository.replaceAccessUsers(eventId, allowedUserIds);
  const event = warService.loadWars().find(entry => entry.id === String(eventId));
  if (!event) return null;

  event.accessMode = normalizeAccessMode(accessMode);
  event.allowedUserIds = normalizeAllowedUserIds(allowedUserIds);
  await warService.updateWar(event);
  return event;
}

async function getEventPveView(event) {
  const optionsRaw = await getEventSlots(event.id);
  const options = optionsRaw.map(option => {
    const enrollments = Array.isArray(option.enrollments) ? option.enrollments : [];
    const primary = enrollments.filter(entry => String(entry.enrollmentType || 'PRIMARY').toUpperCase() !== 'FILLER');
    const fillers = enrollments.filter(entry => String(entry.enrollmentType || 'PRIMARY').toUpperCase() === 'FILLER');
    return {
      ...option,
      enrollments: primary,
      fillers
    };
  });
  const allowedUserIds = Array.isArray(event.allowedUserIds) && event.allowedUserIds.length > 0
    ? event.allowedUserIds
    : await eventOptionRepository.listAccessUsers(event.id);

  return {
    accessMode: normalizeAccessMode(event.accessMode),
    allowedUserIds: normalizeAllowedUserIds(allowedUserIds),
    options,
    fillers: []
  };
}

async function removeEnrollment(eventId, optionId, userId) {
  return await eventOptionRepository.removeEventEnrollment(eventId, optionId, userId);
}

async function moveEnrollment(eventId, fromOptionId, toOptionId, userId) {
  return await eventOptionRepository.moveEventEnrollment(eventId, fromOptionId, toOptionId, userId);
}

async function promoteFiller(eventId, optionId, userId) {
  return await eventOptionRepository.promoteFillerToPrimary(eventId, optionId, userId);
}

async function adminAddEnrollment(eventId, optionId, participant, enrollmentType = 'PRIMARY') {
  return await eventOptionRepository.joinEventOption({
    eventId,
    optionId,
    userId: participant.userId,
    displayName: sanitizeDisplayText(participant.displayName, { maxLength: 64, fallback: 'Usuario' }),
    isFake: Boolean(participant.isFake),
    enrollmentType
  });
}

module.exports = {
  parsePveSlotsInput,
  ensurePveEventType,
  normalizeAccessMode,
  saveEventSlots,
  getEventSlots,
  joinSlot,
  leaveSlot,
  resetEventEnrollments,
  cloneSlots,
  addSlot,
  editSlot,
  deleteSlot,
  moveSlot,
  configureAccess,
  getEventPveView,
  removeEnrollment,
  moveEnrollment,
  promoteFiller,
  adminAddEnrollment
};
