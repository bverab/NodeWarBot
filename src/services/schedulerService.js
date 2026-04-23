const { normalizeEventType } = require('../constants/eventTypes');
const { buildEventMessagePayload, buildEventReadOnlyPayload, getEventMentionableUserIds } = require('./eventRenderService');
const warService = require('./warService');
const { shouldExecute } = require('../utils/cronHelper');
const pveService = require('./pveService');

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
    schedulerInstance.lastCheck = Date.now();
    const wars = warService.loadWars();
    const nowMs = Date.now();
    const now = new Date(nowMs);

    for (const war of wars) {
      if (war.messageId && !war.isClosed && Number.isFinite(war.closesAt) && nowMs >= war.closesAt) {
        await closeWarSignups(war);
      }

      if (war.messageId && shouldPublishRecapThread(war, nowMs)) {
        await publishRecapThread(war);
      }

      if (isWarExpired(war, nowMs)) {
        await expireWarMessage(war);
        continue;
      }

      // Saltarse si no es un evento con schedule
      if (!war.schedule || !war.schedule.enabled) continue;
      if ((war.dayOfWeek === null || war.dayOfWeek === undefined) || !war.time) continue;

      // Verificar si debe ejecutarse
      if (!shouldExecute(war.dayOfWeek, war.time, now, war.timezone)) continue;

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
    const channel = await client.channels.fetch(war.channelId).catch(() => null);
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

    const publicationTimestamp = Date.now();
    const durationMinutes = Number.isFinite(war.duration) && war.duration > 0 ? war.duration : 70;
    const closeBeforeMinutes = Number.isFinite(war.closeBeforeMinutes) && war.closeBeforeMinutes >= 0
      ? Math.floor(war.closeBeforeMinutes)
      : 0;
    const isRestrictedPve = normalizeEventType(war.eventType) === 'pve'
      && String(war.accessMode || 'OPEN').toUpperCase() === 'RESTRICTED';
    const notifyTargets = isRestrictedPve
      ? Array.from(new Set((Array.isArray(war.allowedUserIds) ? war.allowedUserIds : []).map(String).filter(Boolean)))
      : (Array.isArray(war.notifyRoles) ? war.notifyRoles.map(String).filter(Boolean) : []);
    const publishContent = notifyTargets.length > 0
      ? (isRestrictedPve
        ? notifyTargets.map(userId => `<@${userId}>`).join(' ')
        : notifyTargets.map(roleId => `<@&${roleId}>`).join(' '))
      : 'Evento creado automaticamente';

    const expiresAt = publicationTimestamp + durationMinutes * 60 * 1000;
    const closesAt = Math.max(publicationTimestamp, expiresAt - closeBeforeMinutes * 60 * 1000);

    // Publicar nuevo mensaje (incluye menciones configuradas)
    const warForPublication = {
      ...war,
      createdAt: publicationTimestamp,
      expiresAt,
      closesAt,
      isClosed: false,
      recap: {
        ...(war.recap || {}),
        threadId: null,
        lastPostedAt: null
      },
      waitlist: [],
      roles: Array.isArray(war.roles)
        ? war.roles.map(role => ({
            ...role,
            users: []
          }))
        : []
    };

    if (normalizeEventType(war.eventType) === 'pve') {
      await pveService.resetEventEnrollments(war.id);
    }

    const payload = await buildEventMessagePayload(warForPublication);
    const message = await channel.send({
      content: publishContent,
      allowedMentions: notifyTargets.length > 0
        ? (isRestrictedPve ? { parse: [], users: notifyTargets } : { parse: [], roles: notifyTargets })
        : { parse: [] },
      ...payload
    });

    // Actualizar registro del evento
    warForPublication.messageId = message.id;
    warForPublication.schedule.lastCreatedAt = publicationTimestamp;
    if (warForPublication.schedule?.mode === 'once') {
      warForPublication.schedule.enabled = false;
    }
    await warService.updateWar(warForPublication);

    console.log(`✅ Evento auto-publicado: ${war.id} en canal ${war.channelId}`);
  } catch (error) {
    console.error(`❌ Error publicando evento ${war.id}:`, error);
  }
}

function isWarExpired(war, nowMs) {
  if (!war.messageId) return false;
  if (!Number.isFinite(war.expiresAt) || war.expiresAt <= 0) return false;
  return nowMs >= war.expiresAt;
}

function shouldPublishRecapThread(war, nowMs) {
  if (!war.messageId) return false;
  if (!war.recap?.enabled) return false;
  if (war.recap.lastPostedAt) return false;
  if (!Number.isFinite(war.expiresAt) || war.expiresAt <= 0) return false;

  const minutesBefore = Number.isFinite(war.recap.minutesBeforeExpire) ? war.recap.minutesBeforeExpire : 0;
  const publishAt = war.expiresAt - Math.max(0, minutesBefore) * 60 * 1000;
  return nowMs >= publishAt;
}

async function publishRecapThread(war) {
  const { client } = schedulerInstance;

  try {
    const channel = await client.channels.fetch(war.channelId).catch(() => null);
    if (!channel || !channel.messages?.fetch) return;

    const sourceMessage = await channel.messages.fetch(war.messageId).catch(() => null);
    if (!sourceMessage) return;

    const threadName = `Resumen ${war.name}`.slice(0, 100);
    const thread = await sourceMessage.startThread({
      name: threadName,
      autoArchiveDuration: 1440,
      reason: `Resumen final programado para ${war.name}`
    }).catch(() => null);
    if (!thread) return;

    const uniqueUserIds = await getEventMentionableUserIds(war);
    const mentionsLine = uniqueUserIds.length > 0
      ? uniqueUserIds.map(userId => `<@${userId}>`).join(' ')
      : '(sin inscritos para avisar)';
    const customText = String(war.recap?.messageText || '').trim();

    await thread.send({
      content: customText ? `${customText}\n\n${mentionsLine}` : mentionsLine,
      allowedMentions: { parse: ['users'] }
    });

    await thread.send(await buildEventReadOnlyPayload({ ...war, isClosed: true }));

    war.recap.threadId = thread.id;
    war.recap.lastPostedAt = Date.now();
    await warService.updateWar(war);
  } catch (error) {
    console.error(`Error publicando hilo de resumen ${war.id}:`, error);
  }
}

async function closeWarSignups(war) {
  const { client } = schedulerInstance;

  try {
    const channel = await client.channels.fetch(war.channelId).catch(() => null);
    war.isClosed = true;

    if (channel && channel.messages?.fetch && war.messageId) {
      try {
        const message = await channel.messages.fetch(war.messageId);
        await message.edit(await buildEventMessagePayload(war));
      } catch (error) {
        if (error?.code !== 10008) {
          console.warn(`No se pudo actualizar cierre de inscripciones para ${war.id}:`, error?.message || error);
        }
      }
    }

    await warService.updateWar(war);
  } catch (error) {
    console.error(`Error al cerrar inscripciones de ${war.id}:`, error);
  }
}

async function expireWarMessage(war) {
  const { client } = schedulerInstance;

  try {
    const channel = await client.channels.fetch(war.channelId).catch(() => null);
    if (!channel) {
      war.messageId = null;
      war.isClosed = true;
      war.schedule.lastMessageIdDeleted = Date.now();
      await warService.updateWar(war);
      return;
    }

    try {
      const message = await channel.messages.fetch(war.messageId);
      await message.delete();
    } catch (error) {
      if (error?.code !== 10008) {
        console.warn(`No se pudo eliminar evento expirado ${war.id}:`, error?.message || error);
      }
    }

    war.messageId = null;
    war.isClosed = true;
    war.schedule.lastMessageIdDeleted = Date.now();
    await warService.updateWar(war);
    console.log(`Evento expirado y eliminado: ${war.id}`);
  } catch (error) {
    console.error(`Error al expirar evento ${war.id}:`, error);
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
