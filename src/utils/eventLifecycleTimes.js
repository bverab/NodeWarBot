const { formatInTimeZone, fromZonedTime } = require('date-fns-tz');
const { isValidTime, normalizeTimeZone } = require('./cronHelper');

function parseTimeParts(time) {
  if (!isValidTime(time)) return null;
  const [hour, minute] = String(time).split(':').map(Number);
  return { hour, minute };
}

function localDateKey(date, timezone) {
  return formatInTimeZone(date, normalizeTimeZone(timezone), 'yyyy-MM-dd');
}

function zonedDateTimeFromParts(dateKey, time, timezone) {
  const parts = parseTimeParts(time);
  if (!parts || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return null;
  return fromZonedTime(`${dateKey}T${time}:00`, normalizeTimeZone(timezone));
}

function getNextZonedDateKeyForDay(dayOfWeek, time, timezone, now = new Date()) {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !isValidTime(time)) return null;

  const safeTimezone = normalizeTimeZone(timezone);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidateNoon = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const key = localDateKey(candidateNoon, safeTimezone);
    const weekday = Number(formatInTimeZone(candidateNoon, safeTimezone, 'i')) % 7;
    if (weekday !== dayOfWeek) continue;

    const candidate = zonedDateTimeFromParts(key, time, safeTimezone);
    if (candidate && candidate.getTime() > now.getTime()) return key;
  }

  return null;
}

function buildLifecycleForLocalDate({ dateKey, publishTime, signupCloseTime, eventEndTime, timezone }) {
  const publishAt = zonedDateTimeFromParts(dateKey, publishTime, timezone);
  const signupCloseAt = zonedDateTimeFromParts(dateKey, signupCloseTime, timezone);
  let eventEndAt = zonedDateTimeFromParts(dateKey, eventEndTime, timezone);

  if (!publishAt || !signupCloseAt || !eventEndAt) return null;
  if (eventEndAt.getTime() <= signupCloseAt.getTime()) {
    eventEndAt = new Date(eventEndAt.getTime() + 24 * 60 * 60 * 1000);
  }
  if (signupCloseAt.getTime() <= publishAt.getTime() && eventEndAt.getTime() > publishAt.getTime() + 24 * 60 * 60 * 1000) {
    return null;
  }

  return {
    publishAt,
    signupCloseAt,
    eventEndAt
  };
}

function deriveLifecycleForScheduledEvent({ dayOfWeek, publishTime, signupCloseTime, eventEndTime, timezone, now = new Date() }) {
  const dateKey = getNextZonedDateKeyForDay(dayOfWeek, publishTime, timezone, now);
  if (!dateKey) return null;
  return buildLifecycleForLocalDate({ dateKey, publishTime, signupCloseTime, eventEndTime, timezone });
}

function deriveLifecycleForExistingEvent({ event, publishTime, signupCloseTime, eventEndTime, timezone, now = new Date() }) {
  const reference = Number.isFinite(event?.expiresAt)
    ? new Date(event.expiresAt)
    : Number.isFinite(event?.createdAt)
      ? new Date(event.createdAt)
      : now;
  const safeTimezone = normalizeTimeZone(timezone || event?.timezone);
  let dateKey = localDateKey(reference, safeTimezone);
  let lifecycle = buildLifecycleForLocalDate({ dateKey, publishTime, signupCloseTime, eventEndTime, timezone: safeTimezone });

  if (lifecycle && lifecycle.eventEndAt.getTime() <= now.getTime()) {
    dateKey = localDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000), safeTimezone);
    lifecycle = buildLifecycleForLocalDate({ dateKey, publishTime, signupCloseTime, eventEndTime, timezone: safeTimezone });
  }

  return lifecycle;
}

function formatTimeInEventZone(timestamp, timezone, fallback = '22:00') {
  if (!Number.isFinite(timestamp)) return fallback;
  return formatInTimeZone(new Date(timestamp), normalizeTimeZone(timezone), 'HH:mm');
}

function validateFutureLifecycle(lifecycle, now = new Date()) {
  if (!lifecycle) return { ok: false, message: 'Horario invalido. Usa HH:mm.' };
  if (lifecycle.publishAt.getTime() >= lifecycle.signupCloseAt.getTime()) {
    return { ok: false, message: 'Publish Time debe ser menor que Signup Close Time.' };
  }
  if (lifecycle.signupCloseAt.getTime() >= lifecycle.eventEndAt.getTime()) {
    return { ok: false, message: 'Signup Close Time debe ser menor que Event End Time.' };
  }
  if (
    lifecycle.publishAt.getTime() <= now.getTime()
    || lifecycle.signupCloseAt.getTime() <= now.getTime()
    || lifecycle.eventEndAt.getTime() <= now.getTime()
  ) {
    return { ok: false, message: 'Publish Time, Signup Close Time y Event End Time deben estar en el futuro.' };
  }
  return { ok: true, message: null };
}

function applyLifecycleToWar(war, lifecycle) {
  war.createdAt = lifecycle.publishAt.getTime();
  war.scheduledPublishAt = lifecycle.publishAt.getTime();
  war.closesAt = lifecycle.signupCloseAt.getTime();
  war.expiresAt = lifecycle.eventEndAt.getTime();
  war.duration = Math.max(1, Math.round((war.expiresAt - war.createdAt) / 60_000));
  war.closeBeforeMinutes = Math.max(0, Math.round((war.expiresAt - war.closesAt) / 60_000));
  war.isClosed = false;
  if (war.recap) {
    war.recap.threadId = null;
    war.recap.lastPostedAt = null;
  }
  return war;
}

module.exports = {
  applyLifecycleToWar,
  deriveLifecycleForExistingEvent,
  deriveLifecycleForScheduledEvent,
  formatTimeInEventZone,
  validateFutureLifecycle
};
