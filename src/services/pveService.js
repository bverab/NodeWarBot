const { normalizeEventType } = require('../constants/eventTypes');
const eventOptionRepository = require('../db/eventOptionRepository');
const warService = require('./warService');
const { sanitizeDisplayText } = require('../utils/textSafety');
const { normalizeAccessMode, normalizeIds, hasPveAccess } = require('./pveAccessRules');

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

function isFillerEntry(entry) {
  return String(entry?.enrollmentType || 'PRIMARY').toUpperCase() === 'FILLER';
}

async function saveEventSlots(eventId, timeSlots) {
  await eventOptionRepository.replaceEventOptions(eventId, timeSlots);
}

async function getEventSlots(eventId) {
  return await eventOptionRepository.listEventOptionsWithEnrollments(eventId);
}

async function joinSlot(eventId, optionId, participant) {
  const event = warService.getWarById(eventId);
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

  // El acceso se evalua al inscribirse (roles del miembro en ese momento); quien no lo tiene queda como filler.
  const hasAccess = hasPveAccess(event, { userId: participant.userId, userRoleIds: participant.userRoleIds });
  const result = await eventOptionRepository.joinEventOption({
    eventId,
    optionId,
    userId: participant.userId,
    displayName: sanitizeDisplayText(participant.displayName, { maxLength: 64, fallback: 'Usuario' }),
    isFake: Boolean(participant.isFake),
    enrollmentType: hasAccess ? 'PRIMARY' : 'FILLER'
  });
  return result.ok ? { ...result, optionLabel: targetOption.label || targetOption.time } : result;
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

// Los fillers que con el acceso actual califican pasan a titulares por orden de llegada mientras haya
// cupo. Nadie baja a filler: quien ya era titular lo sigue siendo aunque pierda el acceso.
async function promoteQualifiedFillers(event, { resolveMemberRoleIds = null } = {}) {
  const byRoles = normalizeAccessMode(event.accessMode) === 'ROLES';
  const promoted = [];
  for (const option of await getEventSlots(event.id)) {
    const enrollments = Array.isArray(option.enrollments) ? option.enrollments : [];
    const room = option.capacity - enrollments.filter(entry => !isFillerEntry(entry)).length;
    const qualified = [];
    for (const filler of enrollments.filter(isFillerEntry)) {
      if (qualified.length >= room) break;
      const userRoleIds = byRoles && resolveMemberRoleIds && !filler.isFake
        ? await Promise.resolve(resolveMemberRoleIds(filler.userId)).catch(() => [])
        : [];
      if (hasPveAccess(event, { userId: filler.userId, userRoleIds })) qualified.push(filler);
    }
    if (qualified.length === 0) continue;

    const result = await eventOptionRepository.promoteFillersToPrimary(event.id, option.id, qualified.map(entry => entry.userId));
    for (const userId of result.promoted || []) {
      const entry = qualified.find(candidate => candidate.userId === userId);
      promoted.push({ ...entry, enrollmentType: 'PRIMARY', optionId: option.id, optionLabel: option.label || option.time });
    }
  }
  return promoted;
}

// access: { accessMode, allowedUserIds?, allowedRoleIds? }. Una lista omitida se conserva (cambiar de
// modo no borra la lista del otro modo).
async function configureAccess(eventId, access = {}, options = {}) {
  const { war: updated } = await warService.updateWarById(String(eventId), fresh => {
    if (Object.prototype.hasOwnProperty.call(access, 'accessMode')) fresh.accessMode = normalizeAccessMode(access.accessMode);
    if (Array.isArray(access.allowedUserIds)) fresh.allowedUserIds = normalizeIds(access.allowedUserIds);
    if (Array.isArray(access.allowedRoleIds)) fresh.allowedRoleIds = normalizeIds(access.allowedRoleIds);
  });
  if (!updated) return { event: null, promoted: [] };

  const promoted = await promoteQualifiedFillers(updated, options);
  return { event: warService.getWarById(updated.id) || updated, promoted };
}

async function getEventPveView(event) {
  const optionsRaw = await getEventSlots(event.id);
  const options = optionsRaw.map(option => {
    const enrollments = Array.isArray(option.enrollments) ? option.enrollments : [];
    return {
      ...option,
      enrollments: enrollments.filter(entry => !isFillerEntry(entry)),
      fillers: enrollments.filter(isFillerEntry)
    };
  });
  const allowedUserIds = Array.isArray(event.allowedUserIds) && event.allowedUserIds.length > 0
    ? event.allowedUserIds
    : await eventOptionRepository.listAccessUsers(event.id);
  // El agregado del evento ya trae la lista (vacia si no hay roles); solo se consulta si falta.
  const allowedRoleIds = Array.isArray(event.allowedRoleIds)
    ? event.allowedRoleIds
    : await eventOptionRepository.listAccessRoles(event.id);

  return {
    accessMode: normalizeAccessMode(event.accessMode),
    allowedUserIds: normalizeIds(allowedUserIds),
    allowedRoleIds: normalizeIds(allowedRoleIds),
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

async function promoteFillers(eventId, optionId, userIds) {
  return await eventOptionRepository.promoteFillersToPrimary(eventId, optionId, userIds);
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
  promoteQualifiedFillers,
  getEventPveView,
  removeEnrollment,
  moveEnrollment,
  promoteFiller,
  promoteFillers,
  adminAddEnrollment
};
