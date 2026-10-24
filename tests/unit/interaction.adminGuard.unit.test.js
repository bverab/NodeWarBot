const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, asAdmin, createModalFields, collectReplies } = require('../support/interaction/fakes');
const { buildWar, buildWarRole } = require('../factories/warFactory');

const TTL_MS = 30 * 60 * 1000;

describe('guard de admin en el despacho de paneles (H-15, C-9)', () => {
  let war;
  let pveWar;
  let warService;
  let eventManagementService;
  let dispatchComponent;
  let dispatchModal;
  let store;

  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
    global.warEdits = {};
    global.warEditSelections = {};

    war = buildWar({
      id: 'war_guard_1',
      roles: [buildWarRole({ name: 'Tank', max: 2 }), buildWarRole({ name: 'Heal', max: 2 })]
    });
    pveWar = { ...buildWar({ id: 'pve_guard_1' }), eventType: 'pve' };

    warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => [war]);
    warService.updateWar = vi.fn(async updated => updated);
    eventManagementService = requireSrc('src/services/eventManagementService');
    eventManagementService.getEventById = vi.fn(() => pveWar);
    eventManagementService.deletePveSlot = vi.fn(async () => ({ ok: true, event: pveWar }));
    const pveService = requireSrc('src/services/pveService');
    pveService.getEventPveView = vi.fn(async () => ({ options: [] }));
    const discordSync = requireSrc('src/services/discordEventSyncService');
    discordSync.updateEventDiscordMessage = vi.fn(async () => ({ ok: true }));

    dispatchComponent = requireSrc('src/handlers/interactionHandler');
    dispatchModal = requireSrc('src/handlers/modalHandler');
    store = requireSrc('src/utils/eventAdminContextStore');
    store.setSelectedEventContext('user_1', 'guild_1', 'channel_1', war.id, { selectedRoleIndex: 0, scope: 'single' });
  });

  afterEach(() => {
    delete global.eventAdminSelections;
    delete global.warEdits;
    delete global.warEditSelections;
  });

  it('un miembro sin admin con contexto no puede ejecutar acciones del panel de evento', async () => {
    const interaction = createInteraction({ customId: 'panel_event_role_delete' });

    await dispatchComponent(interaction);

    expect(warService.updateWar).not.toHaveBeenCalled();
    expect(war.roles).toHaveLength(2);
    expect(collectReplies(interaction).join('\n')).toContain('Solo Admin');
    expect(interaction.reply.mock.calls[0][0].flags).toBe(64);
  });

  it('un miembro sin admin tampoco puede ejecutar acciones del panel PvE', async () => {
    store.setSelectedEventContext('user_1', 'guild_1', 'channel_1', pveWar.id, { pendingPveOptionId: 'opt_1' });
    const interaction = createInteraction({ customId: 'panel_pve_slot_delete' });

    await dispatchComponent(interaction);

    expect(eventManagementService.deletePveSlot).not.toHaveBeenCalled();
    expect(collectReplies(interaction).join('\n')).toContain('Solo Admin');
  });

  it('un admin sigue pudiendo ejecutar la accion', async () => {
    const interaction = asAdmin(createInteraction({ customId: 'panel_event_role_delete' }));

    await dispatchComponent(interaction);

    expect(warService.updateWar).toHaveBeenCalledTimes(1);
    expect(collectReplies(interaction).join('\n')).not.toContain('Solo Admin');
  });

  it('el rol de Discord llamado "admin" tambien cuenta como admin del bot (sin cambiar la regla actual)', async () => {
    const interaction = createInteraction({ customId: 'panel_event_role_delete' });
    interaction.member.roles.cache.set('r1', { id: 'r1', name: 'Admin' });

    await dispatchComponent(interaction);

    expect(warService.updateWar).toHaveBeenCalledTimes(1);
  });

  it('las acciones del panel de borrador (ROLE_PANEL_ACTIONS) siguen abiertas a cualquier miembro', async () => {
    global.warEdits.user_1 = {
      creatorId: 'user_1',
      eventType: 'war',
      name: 'Borrador',
      roles: [{ name: 'DPS', max: 2, users: [], allowedRoleIds: [] }]
    };
    const interaction = createInteraction({ customId: 'panel_back_to_roles' });

    await dispatchComponent(interaction);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    expect(interaction.update.mock.calls[0][0].content).toContain('Selecciona un rol');
    expect(collectReplies(interaction).join('\n')).not.toContain('Solo Admin');
  });

  it('un modal de administracion enviado por un no admin se rechaza sin escribir', async () => {
    const interaction = createInteraction({
      customId: 'panel_event_role_add_modal',
      isModalSubmit: () => true,
      fields: createModalFields({
        panel_event_role_add_name: 'Nuevo',
        panel_event_role_add_slots: '3',
        panel_event_role_add_icon: ''
      })
    });

    await dispatchModal(interaction);

    expect(warService.updateWar).not.toHaveBeenCalled();
    expect(war.roles).toHaveLength(2);
    expect(collectReplies(interaction).join('\n')).toContain('Solo Admin');
  });

  it('el mismo modal enviado por un admin se procesa', async () => {
    const interaction = asAdmin(createInteraction({
      customId: 'panel_event_role_add_modal',
      isModalSubmit: () => true,
      fields: createModalFields({
        panel_event_role_add_name: 'Nuevo',
        panel_event_role_add_slots: '3',
        panel_event_role_add_icon: ''
      })
    }));

    await dispatchModal(interaction);

    expect(warService.updateWar).toHaveBeenCalledTimes(1);
  });

  it('los modales del borrador (panel_edit_*_modal) no exigen admin', async () => {
    global.warEdits.user_1 = {
      creatorId: 'user_1',
      eventType: 'war',
      name: 'Borrador',
      roles: [{ name: 'DPS', max: 2, users: [], allowedRoleIds: [] }]
    };
    global.warEditSelections.user_1 = 0;
    const interaction = createInteraction({
      customId: 'panel_edit_slots_modal',
      isModalSubmit: () => true,
      fields: createModalFields({ panel_edit_slots_input: '5' })
    });

    await dispatchModal(interaction);

    expect(global.warEdits.user_1.roles[0].max).toBe(5);
  });
});

describe('TTL de 30 minutos del contexto del panel (C-9)', () => {
  let store;

  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
    store = requireSrc('src/utils/eventAdminContextStore');
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  function ageContext(ms) {
    const key = Object.keys(global.eventAdminSelections)[0];
    global.eventAdminSelections[key].updatedAt = Date.now() - ms;
  }

  it('devuelve el contexto dentro del TTL y lo ignora (y borra) al vencer', () => {
    store.setSelectedEventContext('u1', 'g1', 'c1', 'evt_1', { selectedRoleIndex: 1 });

    ageContext(TTL_MS - 60 * 1000);
    expect(store.getSelectedEventContext('u1', 'g1', 'c1')?.eventId).toBe('evt_1');

    ageContext(TTL_MS + 60 * 1000);
    expect(store.getSelectedEventContext('u1', 'g1', 'c1')).toBeNull();
    expect(Object.keys(global.eventAdminSelections)).toHaveLength(0);
  });

  it('un contexto vencido no se hereda al crear uno nuevo', () => {
    store.setSelectedEventContext('u1', 'g1', 'c1', 'evt_1', { selectedRoleIndex: 1, scope: 'series' });
    ageContext(TTL_MS + 1000);

    const fresh = store.setSelectedEventContext('u1', 'g1', 'c1', 'evt_2', {});

    expect(fresh.selectedRoleIndex).toBeNull();
    expect(fresh.scope).toBe('single');
  });

  it('un contexto vencido hace que las acciones respondan que no hay evento seleccionado', async () => {
    const war = buildWar({ id: 'war_ttl_1', roles: [buildWarRole({ name: 'Tank', max: 2 })] });
    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => [war]);
    warService.updateWar = vi.fn(async updated => updated);
    const { EVENT_ADMIN_PANEL_ACTIONS } = requireSrc('src/handlers/interaction/eventAdminPanelActions');
    store.setSelectedEventContext('user_1', 'guild_1', 'channel_1', war.id, { selectedRoleIndex: 0 });
    ageContext(TTL_MS + 1000);

    const interaction = asAdmin(createInteraction({ customId: 'panel_event_role_delete' }));
    await EVENT_ADMIN_PANEL_ACTIONS.panel_event_role_delete(interaction);

    expect(warService.updateWar).not.toHaveBeenCalled();
    expect(collectReplies(interaction).join('\n')).toContain('No hay evento seleccionado');
  });
});
