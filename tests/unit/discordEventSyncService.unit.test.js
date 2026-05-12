function buildEvent(overrides = {}) {
  return {
    id: 'event_1',
    guildId: 'guild_1',
    channelId: 'channel_1',
    messageId: 'message_1',
    eventType: 'war',
    ...overrides
  };
}

async function loadServiceWithRenderMock(payload = { embeds: [], components: [] }) {
  vi.resetModules();
  const eventRenderService = require('../../src/services/eventRenderService');
  eventRenderService.buildEventMessagePayload = vi.fn(async () => payload);
  const service = require('../../src/services/discordEventSyncService');
  return { service, eventRenderService };
}

function buildGuild(channel) {
  return {
    channels: {
      fetch: vi.fn(async id => (id === 'channel_1' ? channel : null))
    }
  };
}

describe('discordEventSyncService', () => {
  it('publica un evento y devuelve messageId estructurado', async () => {
    const { service, eventRenderService } = await loadServiceWithRenderMock();
    const channel = {
      send: vi.fn(async () => ({ id: 'message_created_1' }))
    };
    const guild = buildGuild(channel);

    const result = await service.publishEventToDiscord({
      guild,
      event: buildEvent({ messageId: null }),
      messageOptions: { content: 'publish' }
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'published',
      channelId: 'channel_1',
      messageId: 'message_created_1',
      errorCode: null
    });
    expect(eventRenderService.buildEventMessagePayload).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledWith({ content: 'publish', embeds: [], components: [] });
  });

  it('actualiza un mensaje existente', async () => {
    const { service } = await loadServiceWithRenderMock();
    const message = {
      edit: vi.fn(async () => null)
    };
    const channel = {
      messages: {
        fetch: vi.fn(async () => message)
      }
    };
    const guild = buildGuild(channel);

    const result = await service.updateEventDiscordMessage({
      guild,
      event: buildEvent(),
      messageOptions: { allowedMentions: { parse: [] } }
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'updated',
      channelId: 'channel_1',
      messageId: 'message_1'
    });
    expect(message.edit).toHaveBeenCalledWith({ allowedMentions: { parse: [] }, embeds: [], components: [] });
  });

  it('reporta Unknown Message como missing_message', async () => {
    const { service } = await loadServiceWithRenderMock();
    const channel = {
      messages: {
        fetch: vi.fn(async () => {
          const error = new Error('Unknown Message');
          error.code = 10008;
          throw error;
        })
      }
    };
    const guild = buildGuild(channel);

    const result = await service.resolveEventMessage({
      guild,
      event: buildEvent()
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'missing_message',
      channelId: 'channel_1',
      messageId: 'message_1',
      errorCode: '10008'
    });
  });

  it('reporta Unknown Channel como missing_channel', async () => {
    const { service } = await loadServiceWithRenderMock();
    const guild = {
      channels: {
        fetch: vi.fn(async () => {
          const error = new Error('Unknown Channel');
          error.code = 10003;
          throw error;
        })
      }
    };

    const result = await service.resolveEventMessage({
      guild,
      event: buildEvent()
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'missing_channel',
      channelId: 'channel_1',
      errorCode: '10003',
      errorMessage: 'Unknown Channel'
    });
  });

  it('reporta Missing Access con codigo conocido', async () => {
    const { service } = await loadServiceWithRenderMock();
    const guild = {
      channels: {
        fetch: vi.fn(async () => {
          const error = new Error('Missing Access');
          error.code = 50001;
          throw error;
        })
      }
    };

    const result = await service.resolveEventMessage({
      guild,
      event: buildEvent()
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'missing_access',
      channelId: 'channel_1',
      errorCode: '50001',
      errorMessage: 'Missing Access'
    });
  });

  it('reporta Missing Permissions con codigo conocido', async () => {
    const { service } = await loadServiceWithRenderMock();
    const channel = {
      send: vi.fn(async () => {
        const error = new Error('Missing Permissions');
        error.code = 50013;
        throw error;
      })
    };
    const guild = buildGuild(channel);

    const result = await service.publishEventToDiscord({
      guild,
      event: buildEvent({ messageId: null })
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'missing_permissions',
      channelId: 'channel_1',
      errorCode: '50013',
      errorMessage: 'Missing Permissions'
    });
  });

  it('borra un mensaje existente', async () => {
    const { service } = await loadServiceWithRenderMock();
    const message = {
      delete: vi.fn(async () => null)
    };
    const channel = {
      messages: {
        fetch: vi.fn(async () => message)
      }
    };
    const guild = buildGuild(channel);

    const result = await service.deleteEventDiscordMessage({
      guild,
      event: buildEvent()
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'deleted',
      channelId: 'channel_1',
      messageId: 'message_1'
    });
    expect(message.delete).toHaveBeenCalledTimes(1);
  });

  it('normaliza errores genericos como error', async () => {
    const { service } = await loadServiceWithRenderMock();
    const normalized = service.normalizeDiscordError(new Error('Unexpected failure'));

    expect(normalized).toEqual({
      status: 'error',
      errorCode: null,
      errorMessage: 'Unexpected failure'
    });
  });
});
