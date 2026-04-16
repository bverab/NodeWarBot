const { buildWarMessagePayload } = require('../utils/warMessageBuilder');
const warService = require('./warService');
const { shouldExecute } = require('../utils/cronHelper');

let schedulerInstance = null;
let checkInterval = null;

/**
 * Inicializa el scheduler - debe llamarse una sola vez en index.js
 * @param {Client} client - Discord client
 */
function initScheduler(client) {
  if (schedulerInstance) {
    console.warn('⚠️ Scheduler ya está inicializado');
    return;
  }

  schedulerInstance = {
    client,
    isRunning: false,
    lastCheck: Date.now()
  };

  startScheduler();
  console.log('✅ Scheduler inicializado y corriendo');
}

/**
 * Inicia el loop de verificación (cada minuto)
 */
function startScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // Ejecutar inmediatamente
  checkAndExecuteEvents();

  // Luego cada minuto
  checkInterval = setInterval(checkAndExecuteEvents, 60000);
}

/**
 * Detiene el scheduler
 */
function stopScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  schedulerInstance = null;
  console.log('⏹️ Scheduler detenido');
}

/**
 * Verifica y ejecuta eventos que deben publicarse
 */
async function checkAndExecuteEvents() {
  if (!schedulerInstance) return;

  try {
    const wars = warService.loadWars();
    const now = new Date();

    for (const war of wars) {
      // Saltarse si no es un evento con schedule
      if (!war.schedule || !war.schedule.enabled) continue;
      if (!war.dayOfWeek || !war.time) continue;

      // Verificar si debe ejecutarse
      if (!shouldExecute(war.dayOfWeek, war.time, now)) continue;

      // Verificar si ya se ejecutó hoy
      const lastCreatedDate = new Date(war.schedule.lastCreatedAt || 0);
      const todayString = getDateString(now);
      const lastCreatedString = getDateString(lastCreatedDate);

      if (todayString === lastCreatedString) {
        continue; // Ya ejecutado hoy
      }

      // Ejecutar: publicar nuevo evento
      await executeWarPublication(war);
    }
  } catch (error) {
    console.error('❌ Error en scheduler:', error);
  }
}

/**
 * Obtiene string de fecha (YYYY-MM-DD)
 */
function getDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Ejecuta la publicación de un evento
 */
async function executeWarPublication(war) {
  const { client } = schedulerInstance;

  try {
    const channel = client.channels.cache.get(war.channelId);
    if (!channel) {
      console.warn(`⚠️ No se encontró canal ${war.channelId} para evento ${war.id}`);
      return;
    }

    // Borrar mensaje anterior si existe
    if (war.messageId) {
      try {
        const oldMessage = await channel.messages.fetch(war.messageId);
        await oldMessage.delete();
        console.log(`🗑️ Mensaje anterior eliminado: ${war.messageId}`);
      } catch (e) {
        console.warn(`⚠️ No se pudo eliminar mensaje anterior: ${e.message}`);
      }
    }

    // Publicar nuevo mensaje
    const message = await channel.send({
      content: 'Evento creado automáticamente',
      ...buildWarMessagePayload(war)
    });

    // Hacer mentions si están configurados
    if (war.notifyRoles && war.notifyRoles.length > 0) {
      const mentions = war.notifyRoles.join(' ');
      await channel.send({
        content: `${mentions} - Evento **${war.name}** abierto para inscripciones`,
        allowedMentions: { parse: ['roles', 'users'] }
      });
    }

    // Actualizar registro del evento
    war.messageId = message.id;
    war.schedule.lastCreatedAt = Date.now();
    warService.updateWar(war);

    console.log(`✅ Evento auto-publicado: ${war.id} en canal ${war.channelId}`);
  } catch (error) {
    console.error(`❌ Error publicando evento ${war.id}:`, error);
  }
}

/**
 * Obtiene info del scheduler (para debugging)
 */
function getSchedulerStatus() {
  return {
    isRunning: schedulerInstance ? true : false,
    isActive: checkInterval ? true : false,
    lastCheck: schedulerInstance?.lastCheck
  };
}

module.exports = {
  initScheduler,
  stopScheduler,
  checkAndExecuteEvents,
  getSchedulerStatus
};
