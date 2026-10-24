const { notifyPromotion } = require('../../src/utils/promotionNotifier');

function buildInteraction({ dmFails = true } = {}) {
  const send = vi.fn(async () => null);
  const dm = vi.fn(async () => null);
  return {
    guildId: 'guild_1',
    channelId: 'channel_1',
    message: { id: 'msg_1' },
    client: {
      users: {
        fetch: vi.fn(async () => {
          if (dmFails) throw new Error('DMs cerrados');
          return { send: dm };
        })
      }
    },
    channel: { send },
    _send: send,
    _dm: dm
  };
}

describe('notifyPromotion: menciones permitidas (C-21)', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => null);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('el fallback en canal solo permite mencionar al usuario promovido', async () => {
    const interaction = buildInteraction();

    await notifyPromotion(interaction, { name: 'Evento', channelId: 'channel_1', messageId: 'msg_1' }, {
      userId: '555555555555555555',
      roleName: 'Rol <@999> @everyone',
      isFake: false
    });

    expect(interaction._send).toHaveBeenCalledTimes(1);
    const payload = interaction._send.mock.calls[0][0];
    expect(payload.allowedMentions.users).toEqual(['555555555555555555']);
    expect(payload.allowedMentions.users).not.toContain('999');
    expect(payload.allowedMentions.parse ?? []).not.toContain('users');
    expect(payload.allowedMentions.parse ?? []).not.toContain('everyone');
    expect(payload.allowedMentions.parse ?? []).not.toContain('roles');
    expect(payload.content.startsWith('<@555555555555555555>')).toBe(true);
  });

  it('si el DM funciona no se publica nada en el canal', async () => {
    const interaction = buildInteraction({ dmFails: false });

    await notifyPromotion(interaction, { name: 'Evento' }, { userId: '555555555555555555', roleName: 'Tank', isFake: false });

    expect(interaction._dm).toHaveBeenCalledTimes(1);
    expect(interaction._send).not.toHaveBeenCalled();
  });

  it('ignora usuarios ficticios', async () => {
    const interaction = buildInteraction();

    await notifyPromotion(interaction, { name: 'Evento' }, { userId: 'fake_1', roleName: 'Tank', isFake: true });

    expect(interaction.client.users.fetch).not.toHaveBeenCalled();
    expect(interaction._send).not.toHaveBeenCalled();
  });
});
