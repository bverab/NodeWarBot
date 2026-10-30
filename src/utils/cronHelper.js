/**
 * Validaciones y helpers para scheduling
 */
const DEFAULT_TIMEZONE = 'America/Bogota';
const TIMEZONE_CACHE_MAX_ENTRIES = 200;
const timezoneCache = new Map();
const timezoneAliases = {
  'america/brasil': 'America/Sao_Paulo',
  'america/brazil': 'America/Sao_Paulo',
  'america/chile': 'America/Santiago',
  'america/santiago': 'America/Santiago',
  'america/bogota': 'America/Bogota'
};

/**
 * Valida que la hora esté en formato HH:mm
 * @param {string} timeStr
 * @returns {boolean}
 */
function isValidTime(timeStr) {
  const regex = /^([01]\d|2[0-3]):[0-5]\d$/;
  return regex.test(timeStr);
}

/**
 * Calcula si es hora de ejecutar basado en dayOfWeek y time
 * @param {number} dayOfWeek - 0-6
 * @param {string} time - "HH:mm"
 * @param {Date} currentDate - Fecha actual (UTC/local del servidor)
 * @param {string} timezone - Zona horaria del evento
 * @returns {boolean}
 */
function shouldExecute(dayOfWeek, time, currentDate = new Date(), timezone = 'America/Bogota') {
  const [hours, minutes] = time.split(':').map(Number);
  const safeTimezone = normalizeTimeZone(timezone);
  const zonedNow = getZonedDateParts(currentDate, safeTimezone);
  
  // Verificar si es el día correcto
  if (zonedNow.dayOfWeek !== dayOfWeek) {
    return false;
  }

  // Verificar si es la hora correcta (dentro del mismo minuto)
  if (zonedNow.hours === hours && zonedNow.minutes === minutes) {
    return true;
  }

  return false;
}

function getZonedDateParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find(p => p.type === 'weekday')?.value || 'Sun';
  const hour = Number(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value || '0');

  const dayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    dayOfWeek: dayMap[weekday] ?? 0,
    hours: hour,
    minutes: minute
  };
}

function normalizeTimeZone(timezone) {
  return normalizeTimeZoneInfo(timezone).timezone;
}

function normalizeTimeZoneInfo(timezone) {
  const raw = String(timezone || DEFAULT_TIMEZONE).trim();
  if (!raw) return { timezone: DEFAULT_TIMEZONE, source: 'fallback' };

  const cacheKey = raw.toLowerCase();
  if (timezoneCache.has(cacheKey)) {
    return { ...timezoneCache.get(cacheKey) };
  }

  const hasAlias = Boolean(timezoneAliases[cacheKey]);
  const aliasCandidate = timezoneAliases[cacheKey] || raw;
  const candidates = [
    aliasCandidate,
    aliasCandidate.replace(/\s+/g, '_'),
    aliasCandidate
      .split('/')
      .map(part =>
        part
          .split('_')
          .map(word => word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : word)
          .join('_')
      )
      .join('/')
  ];

  for (const candidate of candidates) {
    if (isValidIanaTimezone(candidate)) {
      return cacheTimezoneInfo(cacheKey, { timezone: candidate, source: hasAlias ? 'alias' : 'exact' });
    }
  }

  return cacheTimezoneInfo(cacheKey, { timezone: DEFAULT_TIMEZONE, source: 'fallback' });
}

function cacheTimezoneInfo(cacheKey, info) {
  if (timezoneCache.size >= TIMEZONE_CACHE_MAX_ENTRIES) {
    timezoneCache.delete(timezoneCache.keys().next().value);
  }
  timezoneCache.set(cacheKey, info);
  return { ...info };
}

function isValidIanaTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  isValidTime,
  normalizeTimeZoneInfo,
  normalizeTimeZone,
  shouldExecute
};
