const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction } = require('../support/interaction/fakes');
const { buildWar, buildWarRole } = require('../factories/warFactory');

const LONG_EVENT_NAME = 'E'.repeat(90);
const LONG_ROLE_NAME = 'R'.repeat(60);

function expectModalWithinDiscordLimits(interaction) {
  expect(interaction.showModal).toHaveBeenCalledTimes(1);
  const json = interaction.showModal.mock.calls[0][0].toJSON();
  expect(json.title.length).toBeGreaterThan(0);
  expect(json.title.length).toBeLessThanOrEqual(45);
  for (const row of json.components) {
    for (const input of row.components) {
      if (typeof input.value === 'string') {
        expect(input.value.length).toBeLessThanOrEqual(input.max_length ?? 4000);
      }
    }
  }
}

describe('modalLimits helper', () => {
  const { buildModalTitle, clampInputValue } = require('../../src/utils/modalLimits');

  it('recorta el titulo completo (prefijo + nombre) a 45 caracteres', () => {
    const title = buildModalTitle('Configurar horarios PvE', LONG_EVENT_NAME);
    expect(title.length).toBeLessThanOrEqual(45);
    expect(title.startsWith('Configurar horarios PvE: ')).toBe(true);
    expect(title.endsWith('...')).toBe(true);
  });

  it('no altera titulos cortos y omite el separador sin nombre', () => {
    expect(buildModalTitle('Agregar rol', 'Evento')).toBe('Agregar rol: Evento');
    expect(buildModalTitle('Agregar rol', '')).toBe('Agregar rol');
  });

  it('no deja media pareja surrogate al recortar', () => {
    const title = buildModalTitle('Titulo', '\u{1F600}'.repeat(40));
    expect(title.length).toBeLessThanOrEqual(45);
    expect(title).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(clampInputValue('\u{1F600}\u{1F600}', 3)).toBe('\u{1F600}');
  });

  it('clampInputValue recorta a maxLength', () => {
    expect(clampInputValue('x'.repeat(60), 50)).toHaveLength(50);
    expect(clampInputValue(null, 50)).toBe('');
  });
});

describe('modales con nombres largos (draft de creacion)', () => {
  let handlers;

  beforeEach(() => {
    resetSrcModules();
    global.warEdits = {};
    global.warEditSelections = {};
    handlers = {
      interaction: requireSrc('src/handlers/interactionHandler'),
      rolePanel: requireSrc('src/handlers/interaction/rolePanelActions').ROLE_PANEL_ACTIONS
    };
  });

  afterEach(() => {
    delete global.warEdits;
    delete global.warEditSelections;
  });

  function setDraft(overrides = {}) {
    global.warEdits.user_1 = {
      creatorId: 'user_1',
      eventType: 'pve',
      name: LONG_EVENT_NAME,
      timeSlots: [{ time: '20:00' }],
      slotCapacity: 5,
      roles: [{ name: LONG_ROLE_NAME, max: 999, emoji: 'E'.repeat(120), users: [], allowedRoleIds: [] }],
      recap: { minutesBeforeExpire: 30, messageText: 'm'.repeat(400) },
      ...overrides
    };
    global.warEditSelections.user_1 = 0;
  }

  it.each(['configure_pve_slots', 'configure_recap'])('%s abre el modal con titulo <= 45', async customId => {
    setDraft();
    const interaction = createInteraction({ customId });
    await handlers.interaction(interaction);
    expectModalWithinDiscordLimits(interaction);
  });

  it.each(['panel_edit_name', 'panel_edit_slots', 'panel_open_icon_modal'])(
    '%s abre el modal con titulo <= 45 y valores <= maxLength',
    async customId => {
      setDraft({ eventType: 'war' });
      const interaction = createInteraction({ customId });
      await handlers.rolePanel[customId](interaction);
      expectModalWithinDiscordLimits(interaction);
    }
  );
});

describe('modales con nombres largos (panel de administracion)', () => {
  let adminActions;
  let pveActions;
  let eventContext;
  let war;
  let pveWar;

  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
    war = buildWar({
      id: 'war_long_1',
      name: LONG_EVENT_NAME,
      type: 'T'.repeat(100),
      roles: [buildWarRole({ name: LONG_ROLE_NAME, max: 3 })],
      schedule: { enabled: true, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    pveWar = { ...buildWar({ id: 'pve_long_1', name: LONG_EVENT_NAME }), eventType: 'pve' };

    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => [war]);
    const eventManagementService = requireSrc('src/services/eventManagementService');
    eventManagementService.getEventById = vi.fn(() => pveWar);
    const pveService = requireSrc('src/services/pveService');
    pveService.getEventPveView = vi.fn(async () => ({
      options: [{ id: 'opt_1', time: '20:00', capacity: 5, enrollments: [], fillers: [] }]
    }));

    adminActions = requireSrc('src/handlers/interaction/eventAdminPanelActions').EVENT_ADMIN_PANEL_ACTIONS;
    pveActions = requireSrc('src/handlers/interaction/pveEventAdminPanelActions').PVE_EVENT_ADMIN_PANEL_ACTIONS;
    eventContext = requireSrc('src/utils/eventAdminContextStore');
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  it.each([
    'panel_event_role_add',
    'panel_event_role_rename',
    'panel_event_role_slots',
    'panel_event_role_icon_modal_open',
    'panel_event_schedule_series_add',
    'panel_event_schedule_series_edit',
    'panel_event_data_edit_basic',
    'panel_event_data_edit_close',
    'panel_event_data_edit_recap',
    'panel_event_data_edit_schedule',
    'panel_event_edit_schedule'
  ])('%s abre el modal con titulo <= 45', async customId => {
    eventContext.setSelectedEventContext('user_1', 'guild_1', 'channel_1', war.id, {
      scope: 'single',
      selectedRoleIndex: 0,
      pendingScheduleTargetEventId: war.id
    });
    const interaction = createInteraction({ customId });
    await adminActions[customId](interaction);
    expectModalWithinDiscordLimits(interaction);
  });

  it.each([
    'panel_pve_slot_add',
    'panel_pve_slot_edit',
    'panel_pve_enroll_move',
    'panel_pve_enroll_add'
  ])('%s abre el modal con titulo <= 45', async customId => {
    eventContext.setSelectedEventContext('user_1', 'guild_1', 'channel_1', pveWar.id, {
      pendingPveOptionId: 'opt_1',
      pendingPveEnrollmentKey: 'PRIMARY:user_2'
    });
    const interaction = createInteraction({ customId });
    await pveActions[customId](interaction);
    expectModalWithinDiscordLimits(interaction);
  });
});

describe('modal de creacion con valores de plantilla largos', () => {
  it('recorta los valores precargados a su maxLength', async () => {
    resetSrcModules();
    const { showCreateEventModal } = requireSrc('src/utils/createEventModal');
    const interaction = createInteraction();

    await showCreateEventModal(interaction, 'war', {
      name: 'N'.repeat(90),
      template: {
        id: 'tpl_1',
        typeDefault: 'T'.repeat(120),
        timezone: 'America/Santiago'.padEnd(80, 'x'),
        time: '22:00',
        duration: 90,
        closeBeforeMinutes: 30
      }
    });

    expectModalWithinDiscordLimits(interaction);
  });
});
