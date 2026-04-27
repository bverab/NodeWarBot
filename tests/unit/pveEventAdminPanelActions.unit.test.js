describe('pveEventAdminPanelActions', () => {
  it('panel_pve_toggle_close alterna isClosed, refresca mensaje publicado y mantiene vista panel', async () => {
    vi.resetModules();

    const baseWar = {
      id: 'pve_toggle_1',
      eventType: 'pve',
      channelId: 'channel_1',
      guildId: 'guild_1',
      name: 'PvE Toggle',
      isClosed: false,
      messageId: 'msg_1',
      schedule: { mode: 'once' }
    };

    const state = {
      context: { eventId: baseWar.id, scope: 'single' },
      wars: [baseWar]
    };

    const warService = require('../../src/services/warService');
    warService.loadWars = vi.fn(() => state.wars.map(war => ({ ...war })));
    warService.updateWar = vi.fn(async war => {
      const next = { ...war };
      state.wars = state.wars.map(entry => (entry.id === next.id ? next : entry));
      return next;
    });

    const contextStore = require('../../src/utils/eventAdminContextStore');
    contextStore.getSelectedEventContext = vi.fn(() => state.context);
    contextStore.setSelectedEventContext = vi.fn((_userId, _guildId, _channelId, eventId, patch) => {
      state.context = {
        ...(state.context || {}),
        eventId,
        ...patch
      };
    });

    const shared = require('../../src/commands/eventadminShared');
    shared.refreshWarMessage = vi.fn(async () => true);

    const { PVE_EVENT_ADMIN_PANEL_ACTIONS } = require('../../src/handlers/interaction/pveEventAdminPanelActions');
    const action = PVE_EVENT_ADMIN_PANEL_ACTIONS.panel_pve_toggle_close;

    const interaction = {
      user: { id: 'admin_1' },
      guildId: 'guild_1',
      channelId: 'channel_1',
      message: { id: 'panel_msg_1' },
      update: vi.fn(async () => null)
    };

    await action(interaction);

    expect(warService.updateWar).toHaveBeenCalledTimes(1);
    expect(shared.refreshWarMessage).toHaveBeenCalledTimes(1);
    expect(state.wars[0].isClosed).toBe(true);
    expect(interaction.update).toHaveBeenCalledTimes(1);
    const updatePayload = interaction.update.mock.calls[0][0];
    expect(updatePayload.content).toContain('cerradas');
    expect(updatePayload.components.flatMap(row => row.components).some(component => component.data.custom_id === 'panel_pve_toggle_close')).toBe(true);
  });
});
