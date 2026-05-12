const { normalizeEventType } = require('../constants/eventTypes');
const { buildEventReadOnlyPayload, getEventMentionableUserIds } = require('./eventRenderService');
const {
  publishEventToDiscord,
  updateEventDiscordMessage,
  deleteEventDiscordMessage
} = require('./discordEventSyncService');
const warService = require('./warService');
const { shouldExecute } = require('../utils/cronHelper');
const pveService = require('./pveService');
const { safeMessageContent, neutralizeMassMentions } = require('../utils/textSafety');
const { logInfo, logWarn, logError } = require('../utils/appLogger');

let schedulerInstance = null;
let checkInterval = null;
let scheduledPublishRunning = false;
let scheduledPublishPromise = null;

/**
 * Inicializa el scheduler - debe llamarse una sola vez en index.js
 * @param {Client} client - Discord client
 */
function initScheduler(client) {
  if (schedulerInstance) {
    logWarn('Scheduler ya estaba inicializado');
    return;
  }

  schedulerInstance = {
    client,
    isRunning: false,
    lastCheck: Date.now()
  };

  startScheduler();
  logInfo('Scheduler inicializado y corriendo');
}

/**
 * Inicia el loop de verificacion (cada minuto)
 */
function startScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  checkAndExecuteEvents();
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
  scheduledPublishRunning = false;
  scheduledPublishPromise = null;
  logInfo('Scheduler detenido');
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

    await processScheduledWebPublishes(now);

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

      if (!war.schedule || !war.schedule.enabled) continue;
      if ((war.dayOfWeek === null || war.dayOfWeek === undefined) || !war.time) continue;

      if (!shouldExecute(war.dayOfWeek, war.time, now, war.timezone)) continue;

      const lastCreatedDate = new Date(war.schedule.lastCreatedAt || 0);
      const todayString = getDateString(now);
      const lastCreatedString = getDateString(lastCreatedDate);

      if (todayString === lastCreatedString) {
        continue;
      }

      await executeWarPublication(war);
    }
  } catch (error) {
    logError('Error en scheduler', error, { action: 'scheduler_tick' });
  }
}

async function processScheduledWebPublishes(now = new Date()) {
  const { client } = schedulerInstance || {};
  if (!client) return;
  if (scheduledPublishRunning) {
    return scheduledPublishPromise;
  }

  scheduledPublishRunning = true;
  scheduledPublishPromise = (async () => {
    logInfo('[scheduler:auto-publish] cycle started', {
      now: now.toISOString()
    });
    const candidates = await warService.loadDueScheduledPublishEvents(now);
    logInfo('[scheduler:auto-publish] due events loaded', {
      count: candidates.length,
      events: candidates.slice(0, 10).map(event => ({
        eventId: event.id,
        title: event.name,
        guildId: event.guildId,
        channelId: event.channelId,
        scheduledPublishAt: event.scheduledPublishAt ? new Date(event.scheduledPublishAt).toISOString() : null
      }))
    });
    for (const event of candidates) {
      await publishScheduledWebEvent(event, now);
    }
  })();

  try {
    await scheduledPublishPromise;
  } finally {
    scheduledPublishRunning = false;
    scheduledPublishPromise = null;
  }
}

async function publishScheduledWebEvent(event, now = new Date()) {
  const { client } = schedulerInstance || {};
  if (!client) return;

  const attemptedAt = now instanceof Date ? now : new Date(now);
  if (!event.channelId) {
    const errorMessage = 'Select a Discord channel before enabling scheduled publish.';
    logWarn('[scheduler:auto-publish] skipped event without channel', {
      eventId: event.id,
      title: event.name,
      scheduledPublishAt: event.scheduledPublishAt ? new Date(event.scheduledPublishAt).toISOString() : null
    });
    await warService.markScheduledPublishAttempt(event.id, errorMessage, attemptedAt);
    await warService.updateWar({ ...event, publishError: errorMessage, lastPublishAttemptAt: attemptedAt.getTime() });
    return;
  }

  try {
    const { content, allowedMentions } = buildScheduledPublicationMentions(event);
    const publishResult = await publishEventToDiscord({
      client,
      event,
      channelId: event.channelId,
      messageOptions: {
        content,
        allowedMentions
      }
    });

    if (!publishResult.ok) {
      const errorMessage = publishResult.errorMessage || publishResult.status || 'Scheduled publish failed.';
      await warService.markScheduledPublishAttempt(
        event.id,
        errorMessage,
        attemptedAt
      );
      await warService.updateWar({ ...event, publishError: errorMessage, lastPublishAttemptAt: attemptedAt.getTime() });
      logWarn('[scheduler:auto-publish] publish failed', {
        action: 'scheduler_web_auto_publish',
        eventId: event.id,
        guildId: event.guildId,
        channelId: event.channelId,
        reason: publishResult.errorMessage || publishResult.status
      });
      return;
    }

    const persisted = await warService.completeScheduledPublishIfUnpublished(event.id, publishResult.messageId, attemptedAt);
    if (!persisted.count) {
      await deleteEventDiscordMessage({
        client,
        event: {
          ...event,
          messageId: publishResult.messageId,
          channelId: publishResult.channelId || event.channelId
        }
      });
      logWarn('[scheduler:auto-publish] compensated duplicate publish race', {
        action: 'scheduler_web_auto_publish_compensate',
        eventId: event.id,
        guildId: event.guildId,
        messageId: publishResult.messageId
      });
      return;
    }

    await warService.updateWar({
      ...event,
      messageId: publishResult.messageId,
      autoPublishEnabled: false,
      publishError: null,
      lastPublishAttemptAt: attemptedAt.getTime()
    });

    logInfo('[scheduler:auto-publish] published event', {
      action: 'scheduler_web_auto_publish',
      eventId: event.id,
      guildId: event.guildId,
      channelId: event.channelId,
      messageId: publishResult.messageId
    });
  } catch (error) {
    const errorMessage = error?.message || 'Scheduled publish failed.';
    await warService.markScheduledPublishAttempt(event.id, errorMessage, attemptedAt);
    await warService.updateWar({ ...event, publishError: errorMessage, lastPublishAttemptAt: attemptedAt.getTime() });
    logError('Error en auto publish web programado', error, {
      action: 'scheduler_web_auto_publish',
      eventId: event.id,
      guildId: event.guildId,
      channelId: event.channelId
    });
  }
}

function buildScheduledPublicationMentions(event) {
  const isRestrictedPve = normalizeEventType(event.eventType) === 'pve'
    && String(event.accessMode || 'OPEN').toUpperCase() === 'RESTRICTED';
  const notifyTargets = isRestrictedPve
    ? Array.from(new Set((Array.isArray(event.allowedUserIds) ? event.allowedUserIds : []).map(String).filter(Boolean)))
    : Array.from(new Set((Array.isArray(event.notifyRoles) ? event.notifyRoles : []).map(String).filter(Boolean)));
  const content = notifyTargets.length > 0
    ? (isRestrictedPve
      ? notifyTargets.map(userId => `<@${userId}>`).join(' ')
      : notifyTargets.map(roleId => `<@&${roleId}>`).join(' '))
    : 'Evento publicado automaticamente';

  return {
    content: safeMessageContent(content, 'Evento publicado automaticamente'),
    allowedMentions: notifyTargets.length > 0
      ? (isRestrictedPve ? { parse: [], users: notifyTargets } : { parse: [], roles: notifyTargets })
      : { parse: [] }
  };
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
 * Ejecuta la publicacion de un evento
 */
async function executeWarPublication(war) {
  const { client } = schedulerInstance;

  try {
    if (war.messageId) {
      const deleteResult = await deleteEventDiscordMessage({ client, event: war });
      if (deleteResult.ok) {
        logInfo('Mensaje anterior eliminado en scheduler', { warId: war.id, messageId: war.messageId });
      } else if (deleteResult.status !== 'missing_message') {
        logWarn('No se pudo eliminar mensaje anterior en scheduler', {
          action: 'scheduler_publish',
          eventId: war.id,
          guildId: war.guildId,
          warId: war.id,
          messageId: war.messageId,
          reason: deleteResult.errorMessage || deleteResult.status
        });
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

    const publishResult = await publishEventToDiscord({
      client,
      event: warForPublication,
      messageOptions: {
        content: safeMessageContent(publishContent, 'Evento creado automaticamente'),
        allowedMentions: notifyTargets.length > 0
          ? (isRestrictedPve ? { parse: [], users: notifyTargets } : { parse: [], roles: notifyTargets })
          : { parse: [] }
      }
    });
    if (!publishResult.ok) {
      logWarn('No se encontro canal para evento programado', {
        action: 'scheduler_publish',
        eventId: war.id,
        warId: war.id,
        guildId: war.guildId,
        channelId: war.channelId,
        reason: publishResult.errorMessage || publishResult.status
      });
      return;
    }

    warForPublication.messageId = publishResult.messageId;
    warForPublication.schedule.lastCreatedAt = publicationTimestamp;
    if (warForPublication.schedule?.mode === 'once') {
      warForPublication.schedule.enabled = false;
    }
    await warService.updateWar(warForPublication);

    logInfo('Evento auto-publicado', {
      action: 'scheduler_publish',
      eventId: war.id,
      warId: war.id,
      guildId: war.guildId,
      channelId: war.channelId,
      messageId: publishResult.messageId
    });
  } catch (error) {
    logError('Error publicando evento programado', error, {
      action: 'scheduler_publish',
      eventId: war.id,
      warId: war.id,
      guildId: war.guildId,
      channelId: war.channelId
    });
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
    const customText = neutralizeMassMentions(String(war.recap?.messageText || '').trim());

    await thread.send({
      content: safeMessageContent(customText ? `${customText}\n\n${mentionsLine}` : mentionsLine, '(sin inscritos para avisar)'),
      allowedMentions: uniqueUserIds.length > 0 ? { parse: [], users: uniqueUserIds } : { parse: [] }
    });

    await thread.send(await buildEventReadOnlyPayload({ ...war, isClosed: true }));

    war.recap.threadId = thread.id;
    war.recap.lastPostedAt = Date.now();
    await warService.updateWar(war);
  } catch (error) {
    logError('Error publicando hilo de resumen', error, {
      action: 'scheduler_recap',
      eventId: war.id,
      warId: war.id,
      guildId: war.guildId,
      channelId: war.channelId
    });
  }
}

async function closeWarSignups(war) {
  const { client } = schedulerInstance;

  try {
    war.isClosed = true;

    if (war.messageId) {
      const updateResult = await updateEventDiscordMessage({ client, event: war });
      if (!updateResult.ok && updateResult.status !== 'missing_message') {
        logWarn('No se pudo actualizar cierre de inscripciones', {
          action: 'scheduler_close_signups',
          eventId: war.id,
          warId: war.id,
          guildId: war.guildId,
          channelId: war.channelId,
          reason: updateResult.errorMessage || updateResult.status
        });
      }
    }

    await warService.updateWar(war);
  } catch (error) {
    logError('Error al cerrar inscripciones', error, {
      action: 'scheduler_close_signups',
      eventId: war.id,
      warId: war.id,
      guildId: war.guildId,
      channelId: war.channelId
    });
  }
}

async function expireWarMessage(war) {
  const { client } = schedulerInstance;

  try {
    const deleteResult = await deleteEventDiscordMessage({ client, event: war });
    if (!deleteResult.ok && deleteResult.status !== 'missing_message' && deleteResult.status !== 'missing_channel') {
      logWarn('No se pudo eliminar evento expirado', {
        action: 'scheduler_expire_event',
        eventId: war.id,
        warId: war.id,
        guildId: war.guildId,
        channelId: war.channelId,
        reason: deleteResult.errorMessage || deleteResult.status
      });
    }

    war.messageId = null;
    war.isClosed = true;
    war.schedule.lastMessageIdDeleted = Date.now();
    await warService.updateWar(war);
    logInfo('Evento expirado y eliminado', {
      action: 'scheduler_expire_event',
      eventId: war.id,
      warId: war.id,
      guildId: war.guildId,
      channelId: war.channelId
    });
  } catch (error) {
    logError('Error al expirar evento', error, {
      action: 'scheduler_expire_event',
      eventId: war.id,
      warId: war.id,
      guildId: war.guildId,
      channelId: war.channelId
    });
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
  processScheduledWebPublishes,
  getSchedulerStatus
};
