describe('buttonHandler PvE success responses', () => {
  function buildInteraction(customId) {
    return {
      customId,
      user: { id: 'user_1', username: 'user1' },
      member: { displayName: 'User One' },
      message: {
        id: 'msg_1',
        edit: vi.fn(async () => null)
      },
      guild: {
        channels: {
          fetch: vi.fn(async () => ({
            messages: {
              fetch: vi.fn(async () => null)
            }
          }))
        }
      },
      client: {},
      isButton: () => true,
      deferUpdate: vi.fn(async () => null),
      followUp: vi.fn(async () => null)
    };
  }

  async function loadHandlerWithMocks({ joinResult = null, leaveResult = null } = {}) {
    vi.resetModules();

    const warService = require('../../src/services/warService');
    const pveService = require('../../src/services/pveService');
    const eventRenderService = require('../../src/services/eventRenderService');

    warService.getWarByMessageId = vi.fn(() => ({ id: 'event_1', eventType: 'pve', channelId: 'channel_1', messageId: 'msg_1' }));
    warService.resolveWarByMessageId = vi.fn(async () => warService.getWarByMessageId());
    warService.updateWarByMessageId = vi.fn();
    warService.deleteWarByMessageId = vi.fn();
    pveService.joinSlot = vi.fn(async () => joinResult);
    pveService.leaveSlot = vi.fn(async () => leaveResult);
    eventRenderService.buildEventMessagePayload = vi.fn(async () => ({ embeds: [], components: [] }));
    eventRenderService.buildEventListText = vi.fn(async () => 'list');

    const buttonHandler = require('../../src/handlers/buttonHandler');
    return { buttonHandler, pveService };
  }

  it('no envia mensaje de confirmacion al unirse/toggle en PvE', async () => {
    const { buttonHandler } = await loadHandlerWithMocks({ joinResult: { ok: true, reason: 'joined' } });
    const interaction = buildInteraction('pve_join_opt_1');
    interaction.guild.channels.fetch = vi.fn(async () => ({
      messages: {
        fetch: vi.fn(async () => interaction.message)
      }
    }));

    await buttonHandler(interaction);

    expect(interaction.message.edit).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('no envia mensaje de confirmacion al salir en PvE', async () => {
    const { buttonHandler } = await loadHandlerWithMocks({ leaveResult: true });
    const interaction = buildInteraction('pve_leave');
    interaction.guild.channels.fetch = vi.fn(async () => ({
      messages: {
        fetch: vi.fn(async () => interaction.message)
      }
    }));

    await buttonHandler(interaction);

    expect(interaction.message.edit).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('pasa los roles del miembro a joinSlot y avisa en privado a quien queda como filler', async () => {
    const { buttonHandler, pveService } = await loadHandlerWithMocks({
      joinResult: { ok: true, reason: 'joined_as_filler', optionLabel: '20:00' }
    });
    const interaction = buildInteraction('pve_join_opt_1');
    interaction.member = { displayName: 'User One', roles: { cache: new Map([['role_a', {}]]) } };
    interaction.guild.channels.fetch = vi.fn(async () => ({
      messages: {
        fetch: vi.fn(async () => interaction.message)
      }
    }));

    await buttonHandler(interaction);

    expect(pveService.joinSlot).toHaveBeenCalledWith('event_1', 'opt_1', expect.objectContaining({ userId: 'user_1', userRoleIds: ['role_a'] }));
    expect(interaction.message.edit).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    const notice = interaction.followUp.mock.calls[0][0];
    expect(notice.flags).toBe(64);
    expect(notice.content).toContain('filler');
    expect(notice.content).toContain('20:00');
  });
});
