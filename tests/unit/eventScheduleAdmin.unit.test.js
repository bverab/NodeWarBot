const { handleScheduleView, handleScheduleCancel, autocompleteScheduleCancel } = require('../../src/commands/event/eventAdmin');

function buildCancelDeps({ isAdmin, wars = [] }) {
  return {
    isAdminExecutor: vi.fn(() => isAdmin),
    safeEphemeralReply: vi.fn(),
    getSanitizedOption: vi.fn(() => 'event_1'),
    warService: {
      loadWars: vi.fn(() => wars),
      deleteWarById: vi.fn(async () => true),
      saveWars: vi.fn(async () => undefined)
    }
  };
}

describe('event schedule admin command', () => {
  it('schedule cancel rechaza a un no admin sin borrar nada', async () => {
    const deps = buildCancelDeps({ isAdmin: false, wars: [{ id: 'event_1', channelId: 'channel_1' }] });

    await handleScheduleCancel({ channelId: 'channel_1' }, deps);

    expect(deps.isAdminExecutor).toHaveBeenCalled();
    expect(deps.safeEphemeralReply.mock.calls[0][1]).toContain('Solo Admin');
    expect(deps.warService.deleteWarById).not.toHaveBeenCalled();
    expect(deps.warService.saveWars).not.toHaveBeenCalled();
  });

  it('schedule cancel de un admin borra solo ese evento', async () => {
    const deps = buildCancelDeps({
      isAdmin: true,
      wars: [
        { id: 'event_1', channelId: 'channel_1' },
        { id: 'event_2', channelId: 'channel_1' }
      ]
    });

    await handleScheduleCancel({ channelId: 'channel_1' }, deps);

    expect(deps.warService.deleteWarById).toHaveBeenCalledWith('event_1');
    expect(deps.warService.saveWars).not.toHaveBeenCalled();
    expect(deps.safeEphemeralReply.mock.calls[0][1]).toContain('Programacion cancelada');
  });

  it('schedule view trunca la respuesta a 2000 caracteres e indica cuantos faltan', async () => {
    const wars = Array.from({ length: 25 }, (_, index) => ({
      id: `evt_${String(index).padStart(2, '0')}_${'x'.repeat(56)}`,
      name: `${'N'.repeat(86)}${String(index).padStart(4, '0')}`,
      channelId: 'channel_1',
      dayOfWeek: index % 7,
      time: '20:00',
      timezone: 'America/Santiago',
      schedule: { enabled: true, mode: 'recurring' }
    }));
    const safeEphemeralReply = vi.fn();

    await handleScheduleView({ channelId: 'channel_1' }, {
      warService: { loadWarsFresh: vi.fn(async () => wars) },
      safeEphemeralReply
    });

    const content = safeEphemeralReply.mock.calls[0][1];
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain('Programaciones activas (25)');
    const shown = content.split('\n').filter(line => line.startsWith('- `')).length;
    expect(shown).toBeGreaterThan(0);
    expect(content).toContain(`y ${25 - shown} mas`);
  });

  it('reads fresh events and shows pending scheduled web publish drafts', async () => {
    const safeEphemeralReply = vi.fn();
    const warService = {
      loadWarsFresh: vi.fn(async () => [
        {
          id: 'web_scheduled_1',
          name: 'Web Scheduled',
          channelId: 'channel_1',
          autoPublishEnabled: true,
          scheduledPublishAt: Date.parse('2026-05-05T22:00:00.000Z'),
          messageId: null,
          time: '23:00',
          timezone: 'America/Santiago',
          schedule: { enabled: false }
        }
      ]),
      loadWars: vi.fn()
    };

    await handleScheduleView({ channelId: 'channel_1' }, { warService, safeEphemeralReply });

    expect(warService.loadWarsFresh).toHaveBeenCalled();
    expect(safeEphemeralReply.mock.calls[0][1]).toContain('Scheduled publish pending');
    expect(safeEphemeralReply.mock.calls[0][1]).toContain('web_scheduled_1');
  });

  it('el autocomplete de schedule cancel lee la cache y no recarga la base en cada tecla', async () => {
    const warService = {
      loadWars: vi.fn(() => [
        { id: 'evt_1', name: 'Semanal', time: '20:00', channelId: 'channel_1', schedule: { enabled: true } }
      ]),
      loadWarsFresh: vi.fn(async () => [])
    };
    const respond = vi.fn();

    await autocompleteScheduleCancel(
      { channelId: 'channel_1', options: { getFocused: () => ({ value: 'sem' }) }, respond },
      { warService }
    );

    expect(warService.loadWarsFresh).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith([{ name: 'Semanal | 20:00 | evt_1', value: 'evt_1' }]);
  });
});
