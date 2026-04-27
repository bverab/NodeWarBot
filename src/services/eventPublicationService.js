const { normalizeEventType } = require('../constants/eventTypes');
const { buildEventMessagePayload } = require('./eventRenderService');
const warService = require('./warService');
const pveService = require('./pveService');
const { safeMessageContent } = require('../utils/textSafety');
const { logWarn, logInfo } = require('../utils/appLogger');

function normalizeNotifyRoles(war) {
  if (normalizeEventType(war.eventType) === 'pve' && String(war.accessMode || 'OPEN').toUpperCase() === 'RESTRICTED') {
    return Array.from(new Set((Array.isArray(war.allowedUserIds) ? war.allowedUserIds : []).map(String).filter(Boolean)));
  }
  return Array.from(new Set((Array.isArray(war.notifyRoles) ? war.notifyRoles : []).map(String).filter(Boolean)));
}

function buildPublicationContent(notifyTargets, targetType = 'roles') {
  if (notifyTargets.length <= 0) {
    return 'Evento publicado manualmente';
  }
  if (targetType === 'users') {
    return safeMessageContent(notifyTargets.map(userId => `<@${userId}>`).join(' '), 'Evento publicado manualmente');
  }
  return safeMessageContent(notifyTargets.map(roleId => `<@&${roleId}>`).join(' '), 'Evento publicado manualmente');
}

function buildAllowedMentions(notifyTargets, targetType = 'roles') {
  if (notifyTargets.length <= 0) {
    return { parse: [] };
  }
  if (targetType === 'users') {
    return { parse: [], users: notifyTargets };
  }
  return { parse: [], roles: notifyTargets };
}

function getNotifyTargetType(war) {
  const isRestrictedPve = normalizeEventType(war.eventType) === 'pve'
    && String(war.accessMode || 'OPEN').toUpperCase() === 'RESTRICTED';
  return isRestrictedPve ? 'users' : 'roles';
}

function buildPublicationMentions(war) {
  const notifyTargets = normalizeNotifyRoles(war);
  const targetType = getNotifyTargetType(war);
  return {
    notifyTargets,
    targetType,
    content: buildPublicationContent(notifyTargets, targetType),
    allowedMentions: buildAllowedMentions(notifyTargets, targetType)
  };
}

async function publishOrRefreshWar(interaction, war) {
  return publishOrRefreshWarWithOptions(interaction, war, {});
}

async function publishOrRefreshWarWithOptions(interaction, war, options = {}) {
  return await publishOrRefreshEventWithContext({
    guild: interaction.guild,
    guildId: interaction.guildId,
    userId: interaction.user?.id
  }, war, options);
}

// Dashboard-ready publishing entrypoint.
// A future HTTP API can pass an explicit Discord context (guild/client-derived
// channel access) without constructing a Discord Interaction object.
async function publishOrRefreshEventWithContext(discordContext, war, options = {}) {
  const channel = await discordContext.guild?.channels?.fetch(war.channelId).catch(error => {
    logWarn('Fallo resolviendo canal para publicacion', {
      action: 'publish_or_refresh',
      guildId: discordContext.guildId,
      userId: discordContext.userId,
      eventId: war.id,
      channelId: war.channelId,
      reason: error?.message || 'unknown'
    });
    return null;
  });
  if (!channel || !channel.send) {
    logWarn('No se pudo publicar: canal inaccesible', {
      action: 'publish_or_refresh',
      guildId: discordContext.guildId,
      userId: discordContext.userId,
      eventId: war.id,
      warId: war.id,
      channelId: war.channelId
    });
    return { ok: false, status: 'error', reason: `No se pudo acceder al canal ${war.channelId}.` };
  }

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

  if (normalizedWar.messageId && !mustRepublish) {
    const existing = await channel.messages.fetch(normalizedWar.messageId).catch(error => {
      logWarn('No se pudo obtener mensaje existente para actualizar', {
        action: 'publish_or_refresh',
        guildId: discordContext.guildId,
        userId: discordContext.userId,
        eventId: normalizedWar.id,
        messageId: normalizedWar.messageId,
        reason: error?.message || 'unknown'
      });
      return null;
    });
    if (existing) {
      const payload = await buildEventMessagePayload(normalizedWar);
      await existing.edit({
        content: safeMessageContent(content, 'Evento publicado manualmente'),
        allowedMentions,
        ...payload
      });
      const persisted = shouldActivate ? await warService.updateWar(normalizedWar) : normalizedWar;
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
  }

  if (mustRepublish && normalizedWar.messageId && channel.messages?.fetch) {
    const stale = await channel.messages.fetch(normalizedWar.messageId).catch(error => {
      logWarn('No se pudo obtener mensaje stale previo a republicacion', {
        action: 'publish_or_refresh',
        guildId: discordContext.guildId,
        userId: discordContext.userId,
        eventId: normalizedWar.id,
        messageId: normalizedWar.messageId,
        reason: error?.message || 'unknown'
      });
      return null;
    });
    if (stale) {
      await stale.delete().catch(error => {
        logWarn('No se pudo borrar mensaje stale previo a republicacion', {
          action: 'publish_or_refresh',
          guildId: discordContext.guildId,
          userId: discordContext.userId,
          eventId: normalizedWar.id,
          messageId: normalizedWar.messageId,
          reason: error?.message || 'unknown'
        });
      });
    }
  }

  const durationMinutes = Number.isFinite(normalizedWar.duration) && normalizedWar.duration > 0 ? normalizedWar.duration : 70;
  const closeBeforeMinutes = Number.isFinite(normalizedWar.closeBeforeMinutes) && normalizedWar.closeBeforeMinutes >= 0
    ? Math.floor(normalizedWar.closeBeforeMinutes)
    : 0;
  const expiresAt = nowMs + durationMinutes * 60 * 1000;
  const closesAt = Math.max(nowMs, expiresAt - closeBeforeMinutes * 60 * 1000);

  const warForPublish = {
    ...normalizedWar,
    createdAt: nowMs,
    expiresAt,
    closesAt,
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
  };

  if (normalizeEventType(war.eventType) === 'pve' && shouldResetRoster) {
    await pveService.resetEventEnrollments(war.id);
  }

  const payload = await buildEventMessagePayload(warForPublish);
  const message = await channel.send({
    content: safeMessageContent(content, 'Evento publicado manualmente'),
    allowedMentions,
    ...payload
  });

  warForPublish.messageId = message.id;
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
