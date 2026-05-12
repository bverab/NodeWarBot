const { buildEventMessagePayload } = require('./eventRenderService');

const DISCORD_ERROR_STATUSES = {
  10003: 'missing_channel',
  10008: 'missing_message',
  50001: 'missing_access',
  50013: 'missing_permissions'
};

function normalizeDiscordError(error) {
  const code = error?.code || error?.rawError?.code || error?.status || null;
  const status = DISCORD_ERROR_STATUSES[code] || 'error';
  const message = error?.rawError?.message || error?.message || null;
  return {
    status,
    errorCode: code ? String(code) : null,
    errorMessage: message
  };
}

function buildResult(base = {}) {
  return {
    ok: Boolean(base.ok),
    status: base.status || (base.ok ? 'ok' : 'error'),
    messageId: base.messageId || null,
    channelId: base.channelId || null,
    errorCode: base.errorCode || null,
    errorMessage: base.errorMessage || null
  };
}

async function resolveEventChannel({ guild = null, client = null, event = null, channelId = null }) {
  const targetChannelId = channelId || event?.channelId || null;
  if (!targetChannelId) {
    return buildResult({
      ok: false,
      status: 'missing_channel',
      channelId: null,
      errorMessage: 'Event channelId is missing.'
    });
  }

  try {
    const channel = guild?.channels?.fetch
      ? await guild.channels.fetch(targetChannelId)
      : await client?.channels?.fetch?.(targetChannelId);

    if (!channel) {
      return buildResult({
        ok: false,
        status: 'missing_channel',
        channelId: targetChannelId,
        errorMessage: `Discord channel ${targetChannelId} was not found.`
      });
    }

    return {
      ...buildResult({ ok: true, status: 'resolved_channel', channelId: targetChannelId }),
      channel
    };
  } catch (error) {
    return {
      ...buildResult({
        ok: false,
        channelId: targetChannelId,
        ...normalizeDiscordError(error)
      }),
      channel: null
    };
  }
}

async function resolveEventMessage({ guild = null, client = null, event }) {
  const channelResult = await resolveEventChannel({ guild, client, event });
  if (!channelResult.ok) {
    return {
      ...channelResult,
      message: null
    };
  }

  const messageId = event?.messageId || null;
  if (!messageId) {
    return {
      ...buildResult({
        ok: false,
        status: 'missing_message',
        channelId: channelResult.channelId,
        messageId: null,
        errorMessage: 'Event messageId is missing.'
      }),
      channel: channelResult.channel,
      message: null
    };
  }

  if (!channelResult.channel?.messages?.fetch) {
    return {
      ...buildResult({
        ok: false,
        status: 'missing_message',
        channelId: channelResult.channelId,
        messageId,
        errorMessage: 'Discord channel does not support message fetching.'
      }),
      channel: channelResult.channel,
      message: null
    };
  }

  try {
    const message = await channelResult.channel.messages.fetch(messageId);
    if (!message) {
      return {
        ...buildResult({
          ok: false,
          status: 'missing_message',
          channelId: channelResult.channelId,
          messageId,
          errorMessage: `Discord message ${messageId} was not found.`
        }),
        channel: channelResult.channel,
        message: null
      };
    }

    return {
      ...buildResult({
        ok: true,
        status: 'resolved_message',
        channelId: channelResult.channelId,
        messageId
      }),
      channel: channelResult.channel,
      message
    };
  } catch (error) {
    return {
      ...buildResult({
        ok: false,
        channelId: channelResult.channelId,
        messageId,
        ...normalizeDiscordError(error)
      }),
      channel: channelResult.channel,
      message: null
    };
  }
}

async function publishEventToDiscord({ guild = null, client = null, event, channelId = null, messageOptions = {} }) {
  const channelResult = await resolveEventChannel({ guild, client, event, channelId });
  if (!channelResult.ok) return channelResult;

  if (!channelResult.channel?.send) {
    return buildResult({
      ok: false,
      status: 'missing_permissions',
      channelId: channelResult.channelId,
      errorMessage: 'Discord channel does not support sending messages.'
    });
  }

  try {
    const payload = await buildEventMessagePayload(event);
    const message = await channelResult.channel.send({
      ...messageOptions,
      ...payload
    });

    return buildResult({
      ok: true,
      status: 'published',
      channelId: channelResult.channelId,
      messageId: message?.id || null
    });
  } catch (error) {
    return buildResult({
      ok: false,
      channelId: channelResult.channelId,
      ...normalizeDiscordError(error)
    });
  }
}

async function updateEventDiscordMessage({ guild = null, client = null, event, messageOptions = {} }) {
  const messageResult = await resolveEventMessage({ guild, client, event });
  if (!messageResult.ok) return messageResult;

  if (!messageResult.message?.edit) {
    return buildResult({
      ok: false,
      status: 'missing_permissions',
      channelId: messageResult.channelId,
      messageId: messageResult.messageId,
      errorMessage: 'Discord message does not support editing.'
    });
  }

  try {
    const payload = await buildEventMessagePayload(event);
    await messageResult.message.edit({
      ...messageOptions,
      ...payload
    });

    return buildResult({
      ok: true,
      status: 'updated',
      channelId: messageResult.channelId,
      messageId: messageResult.messageId
    });
  } catch (error) {
    return buildResult({
      ok: false,
      channelId: messageResult.channelId,
      messageId: messageResult.messageId,
      ...normalizeDiscordError(error)
    });
  }
}

async function deleteEventDiscordMessage({ guild = null, client = null, event }) {
  const messageResult = await resolveEventMessage({ guild, client, event });
  if (!messageResult.ok) return messageResult;

  if (!messageResult.message?.delete) {
    return buildResult({
      ok: false,
      status: 'missing_permissions',
      channelId: messageResult.channelId,
      messageId: messageResult.messageId,
      errorMessage: 'Discord message does not support deletion.'
    });
  }

  try {
    await messageResult.message.delete();
    return buildResult({
      ok: true,
      status: 'deleted',
      channelId: messageResult.channelId,
      messageId: messageResult.messageId
    });
  } catch (error) {
    return buildResult({
      ok: false,
      channelId: messageResult.channelId,
      messageId: messageResult.messageId,
      ...normalizeDiscordError(error)
    });
  }
}

module.exports = {
  publishEventToDiscord,
  updateEventDiscordMessage,
  deleteEventDiscordMessage,
  resolveEventMessage,
  normalizeDiscordError
};
