const warService = require('./warService');
const { normalizeWar } = require('../utils/warState');
const { isValidTime } = require('../utils/cronHelper');
const { normalizeEventType } = require('../constants/eventTypes');
const pveService = require('./pveService');

function listSeriesWars(baseWar, channelId) {
  if (!baseWar?.groupId) return [baseWar].filter(Boolean);
  return warService
    .loadWars()
    .filter(war => war.groupId === baseWar.groupId && war.channelId === channelId)
    .sort((a, b) => (a.dayOfWeek - b.dayOfWeek) || String(a.time).localeCompare(String(b.time)));
}

function validateScheduleInput(time, day) {
  if (!isValidTime(time)) {
    throw new Error('Hora invalida. Usa HH:mm.');
  }
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new Error('Dia invalido. Usa un numero entre 0 y 6.');
  }
}

async function addSeriesDay(baseWar, channelId, time, dayOfWeek) {
  validateScheduleInput(time, dayOfWeek);
  const result = await addSeriesDays(baseWar, channelId, time, String(dayOfWeek));
  if (!result.createdWars.length) {
    throw new Error('No se pudo agregar el dia a la serie.');
  }
  return result.createdWars[0];
}

function parseSeriesDaysInput(rawValue) {
  const raw = String(rawValue || '');
  const tokens = raw
    .split(';')
    .map(token => token.trim())
    .filter(Boolean);

  if (!tokens.length) {
    return {
      days: [],
      invalidTokens: [],
      duplicateInputDays: []
    };
  }

  const invalidTokens = [];
  const duplicateInputDays = [];
  const seenDays = new Set();
  const days = [];

  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      invalidTokens.push(token);
      continue;
    }

    const publicDay = Number.parseInt(token, 10);
    if (!Number.isInteger(publicDay) || publicDay < 0 || publicDay > 6) {
      invalidTokens.push(token);
      continue;
    }

    const internalDay = publicDay;
    if (seenDays.has(internalDay)) {
      duplicateInputDays.push(publicDay);
      continue;
    }
    seenDays.add(internalDay);
    days.push(internalDay);
  }

  return {
    days,
    invalidTokens,
    duplicateInputDays
  };
}

function toPublicDay(dayOfWeek) {
  return dayOfWeek;
}

function createSeriesWarFromSource(source, dayOfWeek, time) {
  const createdAt = Date.now();
  return normalizeWar({
    ...source,
    id: `${source.groupId}_day${dayOfWeek}`,
    dayOfWeek,
    time,
    messageId: null,
    createdAt,
    expiresAt: createdAt + (Number.isInteger(source.duration) ? source.duration : 70) * 60 * 1000,
    closesAt: createdAt + Math.max(0, ((Number.isInteger(source.duration) ? source.duration : 70) - (Number.isInteger(source.closeBeforeMinutes) ? source.closeBeforeMinutes : 0))) * 60 * 1000,
    isClosed: false,
    waitlist: [],
    roles: Array.isArray(source.roles)
      ? source.roles.map(role => ({ ...role, users: [] }))
      : [],
    schedule: {
      ...(source.schedule || {}),
      enabled: true,
      mode: 'recurring'
    },
    recap: {
      ...(source.recap || {}),
      threadId: null,
      lastPostedAt: null
    }
  });
}

async function addSeriesDays(baseWar, channelId, time, daysInputRaw) {
  if (!isValidTime(time)) {
    throw new Error('Hora invalida. Usa HH:mm.');
  }

  const parsed = parseSeriesDaysInput(daysInputRaw);
  if (!parsed.days.length && parsed.invalidTokens.length) {
    throw new Error(`Dias invalidos: ${parsed.invalidTokens.join(', ')}. Usa 0-6 separados por ';'.`);
  }
  if (!parsed.days.length) {
    throw new Error('Debes indicar al menos un dia valido (0-6).');
  }

  const series = listSeriesWars(baseWar, channelId);
  const source = series[0] || baseWar;
  const existingDays = new Set(series.map(war => war.dayOfWeek));

  const createdWars = [];
  const ignoredExistingDays = [];
  for (const dayOfWeek of parsed.days) {
    if (existingDays.has(dayOfWeek)) {
      ignoredExistingDays.push(toPublicDay(dayOfWeek));
      continue;
    }
    const newWar = createSeriesWarFromSource(source, dayOfWeek, time);
    await warService.createWar(newWar);
    if (normalizeEventType(source.eventType) === 'pve') {
      await pveService.cloneSlots(source.id, newWar.id);
    }
    createdWars.push(newWar);
    existingDays.add(dayOfWeek);
  }

  return {
    createdWars,
    addedDays: createdWars.map(war => toPublicDay(war.dayOfWeek)),
    ignoredExistingDays,
    duplicateInputDays: parsed.duplicateInputDays,
    invalidTokens: parsed.invalidTokens
  };
}

async function editSeriesDay(baseWar, channelId, targetEventId, time, dayOfWeek) {
  validateScheduleInput(time, dayOfWeek);
  const wars = warService.loadWars();
  const target = wars.find(war => war.id === String(targetEventId) && war.channelId === channelId);
  if (!target) {
    throw new Error('No se encontro la ocurrencia seleccionada.');
  }
  if (target.groupId !== baseWar.groupId) {
    throw new Error('La ocurrencia seleccionada no pertenece a la serie actual.');
  }

  const conflict = wars.find(war =>
    war.groupId === target.groupId &&
    war.channelId === channelId &&
    war.id !== target.id &&
    war.dayOfWeek === dayOfWeek
  );
  if (conflict) {
    throw new Error('Ya existe una ocurrencia en ese dia para la serie.');
  }

  const nextId = dayOfWeek === target.dayOfWeek ? target.id : `${target.groupId}_day${dayOfWeek}`;
  const idConflict = dayOfWeek !== target.dayOfWeek && wars.some(war => war.id === nextId && war.id !== target.id);
  if (idConflict) {
    throw new Error('No se pudo actualizar: conflicto de identificador en la serie.');
  }

  if (nextId === target.id) {
    target.time = time;
    target.dayOfWeek = dayOfWeek;
    const updated = await warService.updateWar(target);
    return updated;
  }

  let clonedSlots = null;
  if (normalizeEventType(target.eventType) === 'pve') {
    clonedSlots = await pveService.getEventSlots(target.id);
  }

  const index = wars.findIndex(war => war.id === target.id);
  const updated = normalizeWar({
    ...target,
    id: nextId,
    time,
    dayOfWeek
  });
  wars[index] = updated;
  await warService.saveWars(wars);
  if (clonedSlots) {
    await pveService.saveEventSlots(
      updated.id,
      clonedSlots.map((slot, position) => ({
        position,
        label: slot.label,
        time: slot.time,
        capacity: slot.capacity
      }))
    );
  }
  return updated;
}

async function removeSeriesDay(baseWar, channelId, targetEventId) {
  const wars = warService.loadWars();
  const target = wars.find(war => war.id === String(targetEventId) && war.channelId === channelId);
  if (!target) {
    throw new Error('No se encontro la ocurrencia seleccionada.');
  }
  if (target.groupId !== baseWar.groupId) {
    throw new Error('La ocurrencia seleccionada no pertenece a la serie actual.');
  }

  const sameSeries = wars.filter(war => war.groupId === target.groupId && war.channelId === channelId);
  if (sameSeries.length <= 1) {
    throw new Error('No puedes eliminar el ultimo dia de la serie.');
  }

  const filtered = wars.filter(war => war.id !== target.id);
  await warService.saveWars(filtered);
  return target;
}

module.exports = {
  listSeriesWars,
  addSeriesDay,
  addSeriesDays,
  editSeriesDay,
  removeSeriesDay,
  parseSeriesDaysInput
};
