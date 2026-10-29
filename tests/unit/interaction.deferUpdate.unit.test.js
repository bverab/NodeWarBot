const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { routeUpdateWarByIdThroughUpdateWar } = require('../helpers/warServiceMocks');
const { createInteraction, asAdmin, collectReplies } = require('../support/interaction/fakes');
const { buildWar, buildWarRole } = require('../factories/warFactory');

/**
 * H-6 (parcial): los handlers de componentes que hacen REST o publican series reconocen la
 * interaccion con deferUpdate() ANTES del trabajo lento y responden con editReply().
 * `calls` es un unico registro de orden compartido entre la interaccion y los servicios simulados.
 */
function trackedInteraction(calls, overrides = {}) {
  const interaction = asAdmin(createInteraction(overrides));
  interaction.deferUpdate = vi.fn(async () => {
    calls.push('deferUpdate');
    interaction.deferred = true;
  });
  interaction.update = vi.fn(async () => {
    calls.push('update');
  });
  interaction.editReply = vi.fn(async () => {
    calls.push('editReply');
  });
  interaction.followUp = vi.fn(async () => {
    calls.push('followUp');
  });
  interaction.reply = vi.fn(async () => {
    calls.push('reply');
  });
  return interaction;
}

function expectDeferredBeforeWork(calls, workMarkers) {
  expect(calls[0]).toBe('deferUpdate');
  for (const marker of workMarkers) {
    expect(calls).toContain(marker);
    expect(calls.indexOf('deferUpdate')).toBeLessThan(calls.indexOf(marker));
  }
  expect(calls).not.toContain('update');
  expect(calls).toContain('editReply');
  expect(calls.indexOf('editReply')).toBeGreaterThan(Math.max(...workMarkers.map(marker => calls.indexOf(marker))));
}

describe('panel de eventos: deferUpdate antes del trabajo lento (H-6)', () => {
  let calls;
  let war;
  let secondWar;
  let adminActions;
  let eventContext;

  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
    calls = [];

    war = buildWar({
      id: 'serie_day1',
      groupId: 'serie',
      messageId: 'message_1',
      roles: [buildWarRole({ name: 'Tank', max: 2 }), buildWarRole({ name: 'Heal', max: 2 })]
    });
    secondWar = buildWar({ id: 'serie_day2', groupId: 'serie', messageId: 'message_2' });

    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => [war, secondWar]);
    warService.updateWar = vi.fn(async updated => {
      calls.push('updateWar');
      return updated;
    });
    routeUpdateWarByIdThroughUpdateWar(warService);
    const discordSync = requireSrc('src/services/discordEventSyncService');
    discordSync.updateEventDiscordMessage = vi.fn(async () => {
      calls.push('refresh');
      return { ok: true };
    });
    discordSync.deleteEventDiscordMessage = vi.fn(async () => ({ ok: true }));
    const publication = requireSrc('src/services/eventPublicationService');
    publication.publishOrRefreshWarWithOptions = vi.fn(async (interaction, target) => {
      calls.push('publish');
      return { ok: true, status: 'updated', war: target };
    });
    const series = requireSrc('src/services/recurrenceSeriesService');
    series.removeSeriesDay = vi.fn(async (baseWar, channelId, targetId) => {
      calls.push('removeSeriesDay');
      return [war, secondWar].find(entry => entry.id === targetId);
    });

    adminActions = requireSrc('src/handlers/interaction/eventAdminPanelActions').EVENT_ADMIN_PANEL_ACTIONS;
    eventContext = requireSrc('src/utils/eventAdminContextStore');
    eventContext.setSelectedEventContext('user_1', 'guild_1', 'channel_1', war.id, {
      scope: 'series',
      selectedRoleIndex: 0,
      pendingPermissionIds: ['role_a'],
      pendingMentionRoleIds: ['role_m'],
      pendingActivationEventIds: [war.id, secondWar.id],
      pendingScheduleTargetEventId: secondWar.id
    });
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  it.each([
    ['panel_event_role_delete', ['updateWar', 'refresh']],
    ['panel_event_role_move_down', ['updateWar', 'refresh']],
    ['panel_event_cancel_confirm', ['updateWar', 'refresh']],
    ['panel_event_role_icon_clear', ['updateWar', 'refresh']],
    ['panel_event_role_permissions_confirm', ['updateWar', 'refresh']],
    ['panel_event_role_permissions_clear', ['updateWar', 'refresh']],
    ['panel_event_mentions_save', ['updateWar', 'refresh']],
    ['panel_event_finish_publish', ['publish']],
    ['panel_event_post_edit_activate', ['publish']],
    ['panel_event_schedule_series_delete', ['removeSeriesDay']]
  ])('%s hace deferUpdate antes de %j y responde con editReply', async (customId, markers) => {
    const interaction = trackedInteraction(calls, { customId });

    await adminActions[customId](interaction);

    expectDeferredBeforeWork(calls, markers);
  });

  it('los handlers que abren un modal nunca difieren la interaccion', async () => {
    for (const customId of ['panel_event_role_add', 'panel_event_role_rename', 'panel_event_role_slots', 'panel_event_data_edit_basic']) {
      const interaction = trackedInteraction(calls, { customId });

      await adminActions[customId](interaction);

      expect(interaction.showModal).toHaveBeenCalledTimes(1);
      expect(interaction.deferUpdate).not.toHaveBeenCalled();
    }
  });

  it('los handlers sin trabajo lento siguen usando update directo', async () => {
    const interaction = trackedInteraction(calls, { customId: 'panel_event_view_details' });

    await adminActions.panel_event_view_details(interaction);

    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledTimes(1);
  });

  it('tras diferir, un contexto invalido responde con followUp efimero y no con reply', async () => {
    global.eventAdminSelections = {};
    const interaction = trackedInteraction(calls, { customId: 'panel_event_role_delete' });

    await adminActions.panel_event_role_delete(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
    expect(collectReplies(interaction).join('\n')).toContain('No hay evento seleccionado');
  });

  it('si la interaccion ya vencio al diferir, no hace trabajo ni lanza', async () => {
    const interaction = trackedInteraction(calls, { customId: 'panel_event_cancel_confirm' });
    interaction.deferUpdate = vi.fn(async () => {
      throw Object.assign(new Error('Unknown interaction'), { code: 10062 });
    });

    await expect(adminActions.panel_event_cancel_confirm(interaction)).resolves.toBeUndefined();

    expect(calls).not.toContain('updateWar');
  });
});

describe('panel PvE: deferUpdate antes del trabajo lento (H-6)', () => {
  let calls;
  let pveWar;
  let pveActions;

  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
    calls = [];
    pveWar = { ...buildWar({ id: 'pve_1', messageId: 'message_pve' }), eventType: 'pve', accessMode: 'OPEN', allowedUserIds: [] };

    const management = requireSrc('src/services/eventManagementService');
    management.getEventById = vi.fn(() => pveWar);
    management.toggleEventClosed = vi.fn(async () => {
      calls.push('toggle');
      return { ok: true, event: pveWar };
    });
    management.deletePveSlot = vi.fn(async () => {
      calls.push('deleteSlot');
      return { ok: true, event: pveWar };
    });
    management.updatePveAccess = vi.fn(async () => {
      calls.push('updateAccess');
      return { ok: true, event: pveWar };
    });
    const pveService = requireSrc('src/services/pveService');
    pveService.getEventPveView = vi.fn(async () => ({
      options: [{ id: 'opt_1', time: '20:00', capacity: 5, enrollments: [], fillers: [] }]
    }));
    requireSrc('src/services/discordEventSyncService').updateEventDiscordMessage = vi.fn(async () => {
      calls.push('refresh');
      return { ok: true };
    });

    pveActions = requireSrc('src/handlers/interaction/pveEventAdminPanelActions').PVE_EVENT_ADMIN_PANEL_ACTIONS;
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext('user_1', 'guild_1', 'channel_1', pveWar.id, {
      pendingPveOptionId: 'opt_1',
      pendingPveEnrollmentKey: 'PRIMARY:user_2'
    });
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  it.each([
    ['panel_pve_toggle_close', ['toggle', 'refresh']],
    ['panel_pve_slot_delete', ['deleteSlot', 'refresh']]
  ])('%s hace deferUpdate antes de %j y responde con editReply', async (customId, markers) => {
    const interaction = trackedInteraction(calls, { customId });

    await pveActions[customId](interaction);

    expectDeferredBeforeWork(calls, markers);
  });

  it('access_mode_select defiere antes de actualizar el acceso', async () => {
    const interaction = trackedInteraction(calls, {
      customId: 'panel_pve_access_mode_select',
      values: ['USERS'],
      isStringSelectMenu: () => true
    });

    await pveActions.panel_pve_access_mode_select(interaction);

    expectDeferredBeforeWork(calls, ['updateAccess', 'refresh']);
  });

  it('tras diferir, "Selecciona un horario primero" sale como followUp efimero', async () => {
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext('user_1', 'guild_1', 'channel_1', pveWar.id, {
      pendingPveOptionId: null
    });
    const interaction = trackedInteraction(calls, { customId: 'panel_pve_slot_delete' });

    await pveActions.panel_pve_slot_delete(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({ content: 'Selecciona un horario primero.', flags: 64 });
  });

  it('los handlers PvE que abren un modal nunca difieren', async () => {
    for (const customId of ['panel_pve_slot_add', 'panel_pve_slot_edit', 'panel_pve_enroll_move', 'panel_pve_enroll_add']) {
      const interaction = trackedInteraction(calls, { customId });

      await pveActions[customId](interaction);

      expect(interaction.showModal).toHaveBeenCalledTimes(1);
      expect(interaction.deferUpdate).not.toHaveBeenCalled();
    }
  });
});

describe('selector de iconos del borrador: deferUpdate antes de consultar emojis (H-6)', () => {
  afterEach(() => {
    delete global.warEdits;
    delete global.warEditSelections;
    delete global.warPanelPending;
  });

  it.each(['panel_pick_icon_source', 'panel_set_bot_icon'])('%s difiere antes del fetch de emojis', async customId => {
    resetSrcModules();
    global.warEdits = {};
    global.warEditSelections = {};
    global.warPanelPending = {};
    const calls = [];
    global.warEdits.user_1 = {
      creatorId: 'user_1',
      eventType: 'war',
      name: 'Borrador',
      classIconSource: 'bot',
      roles: [{ name: 'Tank', max: 2, users: [], allowedRoleIds: [] }]
    };
    global.warEditSelections.user_1 = 0;
    const { ROLE_PANEL_ACTIONS } = requireSrc('src/handlers/interaction/rolePanelActions');

    const interaction = trackedInteraction(calls, {
      customId,
      values: customId === 'panel_pick_icon_source' ? ['bot'] : ['emoji_1'],
      client: {
        application: {
          id: 'app_1',
          fetch: vi.fn(async () => calls.push('fetchApplication')),
          emojis: { fetch: vi.fn(async () => new Map([['emoji_1', { id: 'emoji_1', name: 'tank', animated: false }]])) }
        }
      }
    });

    await ROLE_PANEL_ACTIONS[customId](interaction);

    expect(calls[0]).toBe('deferUpdate');
    expect(calls).toContain('fetchApplication');
    expect(calls.indexOf('deferUpdate')).toBeLessThan(calls.indexOf('fetchApplication'));
    expect(calls).not.toContain('update');
    expect(calls).toContain('editReply');
  });

  it('el resto de acciones del borrador siguen usando update directo', async () => {
    resetSrcModules();
    global.warEdits = {};
    global.warEdits.user_1 = {
      creatorId: 'user_1',
      eventType: 'war',
      name: 'Borrador',
      roles: [{ name: 'Tank', max: 2, users: [], allowedRoleIds: [] }]
    };
    const { ROLE_PANEL_ACTIONS } = requireSrc('src/handlers/interaction/rolePanelActions');
    const interaction = trackedInteraction([], { customId: 'panel_back_to_roles' });

    await ROLE_PANEL_ACTIONS.panel_back_to_roles(interaction);

    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledTimes(1);
  });
});

describe('panelResponses', () => {
  const { respondUpdate, respondError, deferComponentUpdate } = require('../../src/utils/panelResponses');

  it('respondUpdate usa update sin diferir y editReply tras diferir', async () => {
    const plain = createInteraction();
    await respondUpdate(plain, { content: 'x' });
    expect(plain.update).toHaveBeenCalledWith({ content: 'x' });
    expect(plain.editReply).not.toHaveBeenCalled();

    const deferred = createInteraction({ deferred: true });
    await respondUpdate(deferred, { content: 'y' });
    expect(deferred.editReply).toHaveBeenCalledWith({ content: 'y' });
    expect(deferred.update).not.toHaveBeenCalled();
  });

  it('respondError usa reply sin diferir y followUp efimero tras diferir', async () => {
    const plain = createInteraction();
    await respondError(plain, 'fallo');
    expect(plain.reply).toHaveBeenCalledWith({ content: 'fallo', flags: 64 });

    const deferred = createInteraction({ deferred: true });
    await respondError(deferred, 'fallo');
    expect(deferred.followUp).toHaveBeenCalledWith({ content: 'fallo', flags: 64 });
  });

  it('deferComponentUpdate no vuelve a diferir y relanza errores distintos de 10062/40060', async () => {
    const already = createInteraction({ deferred: true });
    await expect(deferComponentUpdate(already)).resolves.toBe(true);
    expect(already.deferUpdate).not.toHaveBeenCalled();

    const broken = createInteraction();
    broken.deferUpdate = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { code: 50013 });
    });
    await expect(deferComponentUpdate(broken)).rejects.toThrow('boom');
  });
});
