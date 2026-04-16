const { parse, format, toZonedTime, fromZonedTime } = require('date-fns-tz');

/**
 * Convierte una hora local (HH:mm) en la zona horaria del usuario a un timestamp UTC
 * para un día específico de la semana
 * 
 * @param {string} timeStr - Hora en formato "HH:mm"
 * @param {number} dayOfWeek - Día de la semana (0=Dom, 6=Sáb)
 * @param {string} timezone - Zona horaria (ej: "America/Bogota")
 * @returns {number} - Timestamp UTC del próximo evento
 */
function getNextRunTimestamp(timeStr, dayOfWeek, timezone = 'America/Bogota') {
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);

  // Encontrar el próximo día de semana
  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;
  
  if (daysUntil < 0 || (daysUntil === 0 && isPastTime(hours, minutes))) {
    daysUntil += 7;
  }

  const nextDate = new Date(now);
  nextDate.setDate(nextDate.getDate() + daysUntil);
  nextDate.setHours(hours, minutes, 0, 0);

  // Convertir a zona horaria del usuario
  const zonedTime = toZonedTime(nextDate, timezone);
  
  // Convertir de vuelta a UTC
  const utcTime = fromZonedTime(zonedTime, timezone);
  
  return utcTime.getTime();
}

/**
 * Verifica si una hora ya pasó en el día
 * @param {number} hours - Horas
 * @param {number} minutes - Minutos
 * @returns {boolean}
 */
function isPastTime(hours, minutes) {
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();

  return currentHours > hours || (currentHours === hours && currentMinutes >= minutes);
}

/**
 * Obtiene la hora en zona horaria específica
 * @param {string} timezone - Zona horaria
 * @returns {object} - { hours, minutes, day }
 */
function getCurrentTimeInTimezone(timezone = 'America/Bogota') {
  const now = new Date();
  const zonedTime = toZonedTime(now, timezone);

  return {
    hours: zonedTime.getHours(),
    minutes: zonedTime.getMinutes(),
    day: zonedTime.getDay(),
    date: zonedTime.getDate()
  };
}

/**
 * Convierte hora local a UTC timestamp
 * @param {string} timeStr - "HH:mm"
 * @param {Date} baseDate - Fecha base
 * @param {string} timezone - Zona horaria
 * @returns {number}
 */
function timeToUTCTimestamp(timeStr, baseDate, timezone = 'America/Bogota') {
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  const localDate = new Date(baseDate);
  localDate.setHours(hours, minutes, 0, 0);

  const zonedTime = toZonedTime(localDate, timezone);
  const utcTime = fromZonedTime(zonedTime, timezone);

  return utcTime.getTime();
}

/**
 * Obtiene nombre del día de semana
 * @param {number} dayOfWeek - 0-6
 * @returns {string}
 */
function getDayName(dayOfWeek) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayOfWeek] || 'Desconocido';
}

module.exports = {
  getNextRunTimestamp,
  isPastTime,
  getCurrentTimeInTimezone,
  timeToUTCTimestamp,
  getDayName
};
