/**
 * Validaciones y helpers para scheduling
 */
const DEFAULT_TIMEZONE = 'America/Bogota';
const timezoneCache = new Map();
const timezoneAliases = {
  'america/brasil': 'America/Sao_Paulo',
  'america/brazil': 'America/Sao_Paulo',
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
 * Convierte hora en minutos desde medianoche
 * @param {string} timeStr - "HH:mm"
 * @returns {number} - Minutos
 */
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convierte minutos a formato HH:mm
 * @param {number} minutes
 * @returns {string}
 */
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
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
    hour12: false,
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
  const raw = String(timezone || DEFAULT_TIMEZONE).trim();
  if (!raw) return DEFAULT_TIMEZONE;

  const cacheKey = raw.toLowerCase();
  if (timezoneCache.has(cacheKey)) {
    return timezoneCache.get(cacheKey);
  }

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
      timezoneCache.set(cacheKey, candidate);
      return candidate;
    }
  }

  timezoneCache.set(cacheKey, DEFAULT_TIMEZONE);
  return DEFAULT_TIMEZONE;
}

function isValidIanaTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Calcula tiempo hasta próxima ejecución (en milisegundos)
 * @param {number} dayOfWeek - 0-6
 * @param {string} time - "HH:mm"
 * @returns {number} - Milisegundos
 */
function msUntilNextExecution(dayOfWeek, time) {
  const now = new Date();
  const [hours, minutes] = time.split(':').map(Number);

  const today = new Date(now);
  today.setHours(hours, minutes, 0, 0);

  let daysUntil = dayOfWeek - now.getDay();
  if (daysUntil < 0 || (daysUntil === 0 && now > today)) {
    daysUntil += 7;
  }

  const nextRun = new Date(today);
  nextRun.setDate(nextRun.getDate() + daysUntil);

  return Math.max(0, nextRun - now);
}

/**
 * Obtiene label amigable para día + hora
 * @param {number} dayOfWeek
 * @param {string} time
 * @returns {string}
 */
function getScheduleLabel(dayOfWeek, time) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return `${days[dayOfWeek]} ${time}`;
}

module.exports = {
  isValidTime,
  timeToMinutes,
  minutesToTime,
  normalizeTimeZone,
  shouldExecute,
  msUntilNextExecution,
  getScheduleLabel
};
