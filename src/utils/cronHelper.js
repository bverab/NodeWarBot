/**
 * Validaciones y helpers para scheduling
 */

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
 * @param {Date} currentDate - Fecha actual
 * @returns {boolean}
 */
function shouldExecute(dayOfWeek, time, currentDate = new Date()) {
  const [hours, minutes] = time.split(':').map(Number);
  
  // Verificar si es el día correcto
  if (currentDate.getDay() !== dayOfWeek) {
    return false;
  }

  // Verificar si es la hora correcta (dentro del mismo minuto)
  if (currentDate.getHours() === hours && currentDate.getMinutes() === minutes) {
    return true;
  }

  return false;
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
  shouldExecute,
  msUntilNextExecution,
  getScheduleLabel
};
