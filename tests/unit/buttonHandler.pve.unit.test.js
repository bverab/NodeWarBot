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

    warService.getWarByMessageId = vi.fn(() => ({ id: 'event_1', eventType: 'pve' }));
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

    await buttonHandler(interaction);

    expect(interaction.message.edit).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('no envia mensaje de confirmacion al salir en PvE', async () => {
    const { buttonHandler } = await loadHandlerWithMocks({ leaveResult: true });
    const interaction = buildInteraction('pve_leave');

    await buttonHandler(interaction);

    expect(interaction.message.edit).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).not.toHaveBeenCalled();
  });
});
