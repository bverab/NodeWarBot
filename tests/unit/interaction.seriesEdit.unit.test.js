const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, asAdmin, createModalFields, collectReplies } = require('../support/interaction/fakes');
const { buildWar } = require('../factories/warFactory');

// updateWar se mockea: con D-1 pendiente de integrar, aqui solo interesa CUANDO se escribe, no que se persista bien.
describe('ediciones de serie: validar todas las ocurrencias antes de guardar ninguna (H-17)', () => {
  const NOW = new Date('2026-03-10T12:00:00Z'); // martes
  let wars;
  let warService;
  let modalActions;

  function buildSeriesWar(index, overrides = {}) {
    return buildWar({
      id: `serie_day${index}`,
      groupId: 'serie',
      dayOfWeek: index,
      time: '10:00',
      timezone: 'UTC',
      messageId: null,
      createdAt: NOW.getTime() - 2 * 60 * 60 * 1000,
      closesAt: NOW.getTime() + 60 * 60 * 1000,
      expiresAt: NOW.getTime() + 2 * 60 * 60 * 1000,
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null },
      ...overrides
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetSrcModules();
    global.eventAdminSelections = {};

    // Las dos primeras ocurrencias sin publicar; la tercera publicada (validacion mas estricta).
    wars = [
      buildSeriesWar(1),
      buildSeriesWar(2),
      buildSeriesWar(3, { messageId: 'message_published' })
    ];
    warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => wars);
    warService.updateWar = vi.fn(async war => war);
    requireSrc('src/services/discordEventSyncService').updateEventDiscordMessage = vi.fn(async () => ({ ok: true }));
    modalActions = requireSrc('src/handlers/modal/eventAdminModalActions').EVENT_ADMIN_MODAL_ACTIONS;
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext(
      'user_1', 'guild_1', 'channel_1', wars[0].id, { scope: 'series' }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.eventAdminSelections;
  });

  function submit(customId, values) {
    return asAdmin(createInteraction({
      customId,
      isModalSubmit: () => true,
      fields: createModalFields(values)
    }));
  }

  it('horario de toda la serie: si la tercera ocurrencia es invalida no se guarda ninguna', async () => {
    // publica 10:00 pero cierra 09:00: lo tolera una ocurrencia sin publicar, no una publicada.
    const interaction = submit('panel_event_edit_schedule_modal', {
      panel_event_edit_schedule_time: '10:00',
      panel_event_edit_schedule_day: '2',
      panel_event_edit_signup_close_time: '09:00',
      panel_event_edit_event_end_time: '09:30'
    });

    await modalActions.panel_event_edit_schedule_modal(interaction);

    expect(warService.updateWar).not.toHaveBeenCalled();
    expect(collectReplies(interaction).join('\n')).toContain('Publish Time');
    // Tampoco se dejaron mutadas las ocurrencias anteriores.
    expect(wars[0].dayOfWeek).toBe(1);
    expect(wars[1].dayOfWeek).toBe(2);
  });

  it('cierre de toda la serie: si la tercera ocurrencia es invalida no se guarda ninguna', async () => {
    // Cierre 11:00 ya paso (ahora 12:00 UTC) y fin 13:00: invalido solo para la ocurrencia publicada.
    const interaction = submit('panel_event_edit_close_modal', {
      panel_event_edit_signup_close_time: '11:00',
      panel_event_edit_event_end_time: '13:00'
    });
    const before = wars.map(war => ({ closesAt: war.closesAt, expiresAt: war.expiresAt }));

    await modalActions.panel_event_edit_close_modal(interaction);

    expect(warService.updateWar).not.toHaveBeenCalled();
    expect(collectReplies(interaction).join('\n')).toContain('futuro');
    expect(wars.map(war => ({ closesAt: war.closesAt, expiresAt: war.expiresAt }))).toEqual(before);
  });

  it('cierre de toda la serie: con todas validas se guardan las tres, en orden', async () => {
    wars[2].messageId = null; // ya no hay ocurrencia publicada: las tres son validas
    const interaction = submit('panel_event_edit_close_modal', {
      panel_event_edit_signup_close_time: '11:00',
      panel_event_edit_event_end_time: '13:00'
    });

    await modalActions.panel_event_edit_close_modal(interaction);

    expect(warService.updateWar).toHaveBeenCalledTimes(3);
    expect(warService.updateWar.mock.calls.map(call => call[0].id)).toEqual(['serie_day1', 'serie_day2', 'serie_day3']);
  });

  it('horario de toda la serie: con todas validas se guardan las tres con el nuevo dia y hora', async () => {
    wars[2].messageId = null;
    const interaction = submit('panel_event_edit_schedule_modal', {
      panel_event_edit_schedule_time: '10:00',
      panel_event_edit_schedule_day: '2',
      panel_event_edit_signup_close_time: '10:30',
      panel_event_edit_event_end_time: '11:00'
    });

    await modalActions.panel_event_edit_schedule_modal(interaction);

    expect(warService.updateWar).toHaveBeenCalledTimes(3);
    for (const [saved] of warService.updateWar.mock.calls) {
      expect(saved.dayOfWeek).toBe(2);
      expect(saved.time).toBe('10:00');
    }
  });
});
