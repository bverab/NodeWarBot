const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, asAdmin, collectReplies } = require('../support/interaction/fakes');
const { buildWar, buildWarRole } = require('../factories/warFactory');

describe('eventAdminContextStore: null explicito reinicia el contexto (H-4)', () => {
  let store;

  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
    store = requireSrc('src/utils/eventAdminContextStore');
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  const ctx = patch => store.setSelectedEventContext('u1', 'g1', 'c1', 'evt_1', patch);

  it('selectedRoleIndex: null reinicia, omitido o undefined conserva', () => {
    ctx({ selectedRoleIndex: 2 });
    expect(ctx({}).selectedRoleIndex).toBe(2);
    expect(ctx({ selectedRoleIndex: undefined }).selectedRoleIndex).toBe(2);
    expect(ctx({ selectedRoleIndex: null }).selectedRoleIndex).toBeNull();
    expect(ctx({}).selectedRoleIndex).toBeNull();
  });

  it.each([
    'pendingPermissionIds',
    'pendingMentionRoleIds',
    'pendingAllowedUserIds',
    'pendingActivationEventIds'
  ])('%s: null reinicia, omitido conserva y [] se respeta', key => {
    ctx({ [key]: ['a', 'b'] });
    expect(ctx({})[key]).toEqual(['a', 'b']);
    expect(ctx({ [key]: undefined })[key]).toEqual(['a', 'b']);
    expect(ctx({ [key]: [] })[key]).toEqual([]);
    ctx({ [key]: ['a'] });
    expect(ctx({ [key]: null })[key]).toBeNull();
    expect(ctx({})[key]).toBeNull();
  });
});

describe('panel de administracion: cambiar de evento limpia el rol seleccionado (H-4)', () => {
  it('"Eliminar" tras seleccionar otro evento responde que falta seleccionar un rol y no escribe', async () => {
    resetSrcModules();
    global.eventAdminSelections = {};
    const roles = () => [
      buildWarRole({ name: 'A1' }),
      buildWarRole({ name: 'A2' }),
      buildWarRole({ name: 'A3' })
    ];
    const warA = buildWar({ id: 'war_a', roles: roles() });
    const warB = buildWar({ id: 'war_b', roles: roles() });

    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => [warA, warB]);
    warService.updateWar = vi.fn(async war => war);
    const { EVENT_ADMIN_PANEL_ACTIONS } = requireSrc('src/handlers/interaction/eventAdminPanelActions');
    const { setSelectedEventContext } = requireSrc('src/utils/eventAdminContextStore');

    // El admin tenia seleccionado el rol 2 del evento A.
    setSelectedEventContext('user_1', 'guild_1', 'channel_1', warA.id, { selectedRoleIndex: 2, scope: 'single' });

    const select = asAdmin(createInteraction({
      customId: 'panel_event_select',
      values: [warB.id],
      isStringSelectMenu: () => true
    }));
    await EVENT_ADMIN_PANEL_ACTIONS.panel_event_select(select);

    const del = asAdmin(createInteraction({ customId: 'panel_event_role_delete' }));
    await EVENT_ADMIN_PANEL_ACTIONS.panel_event_role_delete(del);

    expect(collectReplies(del).join('\n')).toContain('Primero selecciona un rol');
    expect(warService.updateWar).not.toHaveBeenCalled();
    expect(warB.roles).toHaveLength(3);
    expect(warA.roles).toHaveLength(3);

    delete global.eventAdminSelections;
  });
});
