const { normalizeEventType } = require('../constants/eventTypes');
const {
  publishEventToDiscord,
  updateEventDiscordMessage,
  deleteEventDiscordMessage
} = require('./discordEventSyncService');
const warService = require('./warService');
const pveService = require('./pveService');
const { safeMessageContent } = require('../utils/textSafety');
const { buildPublicationMentions: buildAccessPublicationMentions } = require('./pveAccessRules');
const { logWarn, logInfo } = require('../utils/appLogger');
const {
  applyLifecycleToWar,
  deriveLifecycleForExistingEvent,
  deriveLifecycleForScheduledEvent,
  formatTimeInEventZone,
  validateFutureLifecycle
} = require('../utils/eventLifecycleTimes');

function buildPublicationMentions(war) {
  const mentions = buildAccessPublicationMentions(war, 'Evento publicado manualmente');
  return { ...mentions, content: safeMessageContent(mentions.content, 'Evento publicado manualmente') };
}

async function publishOrRefreshWar(interaction, war) {
  return publishOrRefreshWarWithOptions(interaction, war, {});
}

async function publishOrRefreshWarWithOptions(interaction, war, options = {}) {
  return await publishOrRefreshEventWithContext({
    guild: interaction.guild,
    client: interaction.client,
    guildId: interaction.guildId,
    userId: interaction.user?.id
  }, war, options);
}

// Dashboard-ready publishing entrypoint.
// A future HTTP API can pass an explicit Discord context (guild/client-derived
// channel access) without constructing a Discord Interaction object.
async function publishOrRefreshEventWithContext(discordContext, war, options = {}) {
  const shouldActivate = Boolean(options.activate);
  const shouldResetRoster = Boolean(options.resetRoster);
  const nowMs = Date.now();
  const normalizedWar = {
    ...war,
    isClosed: shouldActivate ? false : Boolean(war.isClosed),
    schedule: war.schedule
      ? {
          ...war.schedule,
          enabled: shouldActivate && war.schedule.mode === 'recurring'
            ? true
            : Boolean(war.schedule.enabled)
        }
      : war.schedule
  };

  const { content, allowedMentions } = buildPublicationMentions(war);
  const isExpired = Number.isFinite(normalizedWar.expiresAt) && normalizedWar.expiresAt > 0 && nowMs >= normalizedWar.expiresAt;
  const mustRepublish = shouldActivate && (isExpired || !normalizedWar.messageId);
  if (shouldActivate && !mustRepublish) {
    if (
      !Number.isFinite(normalizedWar.closesAt)
      || !Number.isFinite(normalizedWar.expiresAt)
      || normalizedWar.closesAt >= normalizedWar.expiresAt
      || normalizedWar.closesAt <= nowMs
      || normalizedWar.expiresAt <= nowMs
    ) {
      return {
        ok: false,
        status: 'invalid_lifecycle',
        reason: 'Signup Close Time y Event End Time deben estar en el futuro, y Signup Close Time debe ser menor que Event End Time.',
        errorCode: null
      };
    }
  }

  if (normalizedWar.messageId && !mustRepublish) {
    // El render lee la cache: al activar se persiste antes de editar el mensaje.
    const persisted = shouldActivate ? await warService.updateWar(normalizedWar) : normalizedWar;
    const updateResult = await updateEventDiscordMessage({
      guild: discordContext.guild,
      client: discordContext.client,
      event: normalizedWar,
      messageOptions: {
        content: safeMessageContent(content, 'Evento publicado manualmente'),
        allowedMentions
      }
    });
    if (updateResult.ok) {
      logInfo('Evento actualizado en mensaje existente', {
        action: 'publish_or_refresh',
        guildId: discordContext.guildId,
        userId: discordContext.userId,
        eventId: normalizedWar.id,
        warId: normalizedWar.id,
        messageId: normalizedWar.messageId
      });
      return { ok: true, status: 'updated', war: persisted };
    }

    logWarn('No se pudo obtener mensaje existente para actualizar', {
      action: 'publish_or_refresh',
      guildId: discordContext.guildId,
      userId: discordContext.userId,
      eventId: normalizedWar.id,
      messageId: normalizedWar.messageId,
      reason: updateResult.errorMessage || updateResult.status
    });

    // Solo se republica si el mensaje ya no existe; con otros errores se evita duplicarlo.
    if (updateResult.status !== 'missing_message' && shouldActivate) {
      // La activacion ya quedo guardada: se informa aparte de un fallo real.
      return {
        ok: false,
        saved: true,
        status: 'saved_message_not_updated',
        reason: `Cambios guardados, pero no se pudo actualizar el mensaje de Discord: ${updateResult.errorMessage || updateResult.status}`,
        errorCode: updateResult.errorCode,
        war: persisted
      };
    }
    if (updateResult.status !== 'missing_message') {
      return {
        ok: false,
        status: updateResult.status,
        reason: updateResult.errorMessage || updateResult.status,
        errorCode: updateResult.errorCode
      };
    }
  }

  if (mustRepublish && normalizedWar.messageId) {
    const deleteResult = await deleteEventDiscordMessage({
      guild: discordContext.guild,
      client: discordContext.client,
      event: normalizedWar
    });
    if (!deleteResult.ok && deleteResult.status !== 'missing_message') {
      logWarn('No se pudo borrar mensaje stale previo a republicacion', {
        action: 'publish_or_refresh',
        guildId: discordContext.guildId,
        userId: discordContext.userId,
        eventId: normalizedWar.id,
        messageId: normalizedWar.messageId,
        reason: deleteResult.errorMessage || deleteResult.status
      });
    }
  }

  const lifecycle = Number.isInteger(normalizedWar.dayOfWeek) && normalizedWar.time
    ? deriveLifecycleForScheduledEvent({
        dayOfWeek: normalizedWar.dayOfWeek,
        publishTime: normalizedWar.time,
        signupCloseTime: formatTimeInEventZone(normalizedWar.closesAt, normalizedWar.timezone, normalizedWar.time || '22:30'),
        eventEndTime: formatTimeInEventZone(normalizedWar.expiresAt, normalizedWar.timezone, '23:00'),
        timezone: normalizedWar.timezone,
        now: new Date(nowMs)
      })
    : deriveLifecycleForExistingEvent({
        event: normalizedWar,
        publishTime: normalizedWar.time || formatTimeInEventZone(normalizedWar.createdAt, normalizedWar.timezone, '22:00'),
        signupCloseTime: formatTimeInEventZone(normalizedWar.closesAt, normalizedWar.timezone, normalizedWar.time || '22:30'),
        eventEndTime: formatTimeInEventZone(normalizedWar.expiresAt, normalizedWar.timezone, '23:00'),
        timezone: normalizedWar.timezone,
        now: new Date(nowMs)
      });
  const validation = validateFutureLifecycle(lifecycle, new Date(nowMs));
  if (!validation.ok) {
    return {
      ok: false,
      status: 'invalid_lifecycle',
      reason: validation.message,
      errorCode: null
    };
  }

  const warForPublish = applyLifecycleToWar({
    ...normalizedWar,
    isClosed: false,
    waitlist: shouldResetRoster ? [] : (Array.isArray(war.waitlist) ? war.waitlist : []),
    roles: Array.isArray(war.roles)
      ? war.roles.map(role => ({
          ...role,
          users: shouldResetRoster ? [] : (Array.isArray(role.users) ? role.users : [])
        }))
      : [],
    recap: {
      ...(war.recap || {}),
      threadId: null,
      lastPostedAt: null
    }
  }, lifecycle);

  if (normalizeEventType(war.eventType) === 'pve' && shouldResetRoster) {
    await pveService.resetEventEnrollments(war.id);
  }

  const publishResult = await publishEventToDiscord({
    guild: discordContext.guild,
    client: discordContext.client,
    event: warForPublish,
    channelId: warForPublish.channelId,
    messageOptions: {
      content: safeMessageContent(content, 'Evento publicado manualmente'),
      allowedMentions
    }
  });
  if (!publishResult.ok) {
    logWarn('No se pudo publicar evento', {
      action: 'publish_or_refresh',
      guildId: discordContext.guildId,
      userId: discordContext.userId,
      eventId: warForPublish.id,
      channelId: warForPublish.channelId,
      reason: publishResult.errorMessage || publishResult.status
    });
    return {
      ok: false,
      status: publishResult.status,
      reason: publishResult.errorMessage || publishResult.status,
      errorCode: publishResult.errorCode
    };
  }

  warForPublish.messageId = publishResult.messageId;
  if (warForPublish.schedule) {
    warForPublish.schedule.lastCreatedAt = nowMs;
    if (warForPublish.schedule.mode === 'once') {
      warForPublish.schedule.enabled = false;
    }
  }

  const updatedWar = await warService.updateWar(warForPublish);
  logInfo('Evento publicado', {
    action: 'publish_or_refresh',
    guildId: discordContext.guildId,
    userId: discordContext.userId,
    eventId: updatedWar.id,
    warId: updatedWar.id,
    messageId: updatedWar.messageId,
    channelId: updatedWar.channelId
  });
  return { ok: true, status: 'published', war: updatedWar };
}

module.exports = {
  publishOrRefreshWar,
  publishOrRefreshWarWithOptions,
  publishOrRefreshEventWithContext
};
