const { buildWarMessagePayload } = require('../utils/warMessageBuilder');
const warService = require('./warService');

function normalizeNotifyRoles(war) {
  return Array.from(new Set((Array.isArray(war.notifyRoles) ? war.notifyRoles : []).map(String).filter(Boolean)));
}

function buildPublicationContent(notifyRoles) {
  return notifyRoles.length > 0
    ? notifyRoles.map(roleId => `<@&${roleId}>`).join(' ')
    : 'Evento publicado manualmente';
}

async function publishOrRefreshWar(interaction, war) {
  return publishOrRefreshWarWithOptions(interaction, war, {});
}

async function publishOrRefreshWarWithOptions(interaction, war, options = {}) {
  const channel = await interaction.guild?.channels?.fetch(war.channelId).catch(() => null);
  if (!channel || !channel.send) {
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

  const notifyRoles = normalizeNotifyRoles(war);
  const content = buildPublicationContent(notifyRoles);
  const allowedMentions = notifyRoles.length > 0 ? { parse: [], roles: notifyRoles } : { parse: [] };
  const isExpired = Number.isFinite(normalizedWar.expiresAt) && normalizedWar.expiresAt > 0 && nowMs >= normalizedWar.expiresAt;
  const mustRepublish = shouldActivate && (isExpired || !normalizedWar.messageId);

  if (normalizedWar.messageId && !mustRepublish) {
    const existing = await channel.messages.fetch(normalizedWar.messageId).catch(() => null);
    if (existing) {
      await existing.edit({
        content,
        allowedMentions,
        ...buildWarMessagePayload(normalizedWar)
      });
      const persisted = shouldActivate ? await warService.updateWar(normalizedWar) : normalizedWar;
      return { ok: true, status: 'updated', war: persisted };
    }
  }

  if (mustRepublish && normalizedWar.messageId && channel.messages?.fetch) {
    const stale = await channel.messages.fetch(normalizedWar.messageId).catch(() => null);
    if (stale) {
      await stale.delete().catch(() => null);
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

  const message = await channel.send({
    content,
    allowedMentions,
    ...buildWarMessagePayload(warForPublish)
  });

  warForPublish.messageId = message.id;
  if (warForPublish.schedule) {
    warForPublish.schedule.lastCreatedAt = nowMs;
    if (warForPublish.schedule.mode === 'once') {
      warForPublish.schedule.enabled = false;
    }
  }

  const updatedWar = await warService.updateWar(warForPublish);
  return { ok: true, status: 'published', war: updatedWar };
}

module.exports = {
  publishOrRefreshWar,
  publishOrRefreshWarWithOptions
};
