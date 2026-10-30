const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, asAdmin, createCollection } = require('../support/interaction/fakes');
const { buildWar } = require('../factories/warFactory');

/**
 * Acceso PvE (Abierto / Por roles / Por personas) en la creacion del borrador y en el panel
 * `/event edit`: que se explica cada modo, que selector aparece, que se guarda y que las personas
 * elegidas deben poder ver el canal del evento.
 */
const MEMBERS = {
  ok_user: { canView: true },
  hidden_user: { canView: false },
  bot_user: { canView: true, bot: true },
  role_user: { canView: true, roles: ['role_ok'] }
};

function withChannelMembers(interaction) {
  const channel = { id: 'channel_1', permissionsFor: member => ({ has: () => Boolean(member.canView) }) };
  interaction.guild.channels.fetch = vi.fn(async id => (String(id) === 'channel_1' ? channel : null));
  interaction.guild.members = {
    fetch: vi.fn(async ({ user, force }) => {
      // Sin el intent GuildMembers la cache de miembros no se actualiza: siempre se pide fresco.
      expect(force).toBe(true);
      const member = MEMBERS[String(user)];
      if (!member) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
      return {
        id: String(user),
        user: { id: String(user), bot: Boolean(member.bot) },
        canView: member.canView,
        roles: { cache: createCollection((member.roles || []).map(roleId => [roleId, { id: roleId }])) }
      };
    })
  };
  return interaction;
}

function lastPayload(mockFn) {
  return mockFn.mock.calls[mockFn.mock.calls.length - 1][0];
}

function componentsJson(payload) {
  return payload.components.map(row => (typeof row.toJSON === 'function' ? row.toJSON() : row).components);
}

function embedText(payload) {
  const embed = payload.embeds[0].toJSON ? payload.embeds[0].toJSON() : payload.embeds[0].data;
  return [embed.title, embed.description, ...(embed.fields || []).flatMap(field => [field.name, field.value])].join('\n');
}

describe('acceso PvE: interfaz compartida', () => {
  beforeEach(() => resetSrcModules());

  it('el selector de modo explica los tres modos y solo muestra el selector del modo activo', () => {
    const { buildPveAccessView } = requireSrc('src/utils/pveAccessUi');
    const ids = { mode: 'm', roles: 'r', users: 'u' };

    const roles = buildPveAccessView({ eventType: 'pve', accessMode: 'ROLES', allowedRoleIds: ['role_1'] }, { customIds: ids });
    const [modeMenu] = roles.rows[0].toJSON().components;
    expect(modeMenu.options.map(option => [option.value, option.label, Boolean(option.default)])).toEqual([
      ['OPEN', 'Abierto', false],
      ['ROLES', 'Por roles', true],
      ['USERS', 'Por personas', false]
    ]);
    expect(modeMenu.options.every(option => option.description.length > 0 && option.description.length <= 100)).toBe(true);
    const rolePicker = roles.rows[1].toJSON().components[0];
    expect(rolePicker).toMatchObject({ type: 6, custom_id: 'r', min_values: 0, max_values: 25 });
    expect(rolePicker.default_values).toEqual([{ id: 'role_1', type: 'role' }]);
    const rolesText = embedText({ embeds: [roles.embed] });
    expect(rolesText).toContain('Por roles');
    expect(rolesText).toContain('<@&role_1>');
    expect(rolesText).toContain('filler');

    const users = buildPveAccessView({ eventType: 'pve', accessMode: 'USERS', allowedUserIds: ['user_1'] }, { customIds: ids });
    const userPicker = users.rows[1].toJSON().components[0];
    expect(userPicker).toMatchObject({ type: 5, custom_id: 'u' });
    expect(userPicker.default_values).toEqual([{ id: 'user_1', type: 'user' }]);
    expect(embedText({ embeds: [users.embed] })).toContain('ver este canal');

    expect(buildPveAccessView({ eventType: 'pve', accessMode: 'OPEN' }, { customIds: ids }).rows).toHaveLength(1);
  });
});

describe('acceso PvE en la creacion del borrador', () => {
  let interactionHandler;
  let store;

  beforeEach(() => {
    resetSrcModules();
    store = requireSrc('src/utils/draftSessionStore');
    interactionHandler = requireSrc('src/handlers/interactionHandler');
  });

  function draft(extra = {}) {
    const warData = { name: 'Boss', eventType: 'pve', channelId: 'channel_1', accessMode: 'OPEN', allowedUserIds: [], allowedRoleIds: [], timeSlots: [], ...extra };
    store.setDraftWar('user_1', warData);
    return warData;
  }

  it('configurar acceso muestra el modo actual con su selector', async () => {
    draft({ accessMode: 'USERS', allowedUserIds: ['ok_user'] });
    const interaction = createInteraction({ customId: 'configure_pve_access', isButton: () => true });

    await interactionHandler(interaction);

    const payload = lastPayload(interaction.update);
    expect(embedText(payload)).toContain('Por personas');
    expect(embedText(payload)).toContain('<@ok_user>');
    const [modeRow, pickerRow, buttons] = componentsJson(payload);
    expect(modeRow[0].custom_id).toBe('pve_access_mode_select');
    expect(pickerRow[0]).toMatchObject({ type: 5, custom_id: 'pve_access_users_select' });
    expect(buttons.map(button => button.custom_id)).toEqual(['pve_access_save', 'pve_access_back']);
  });

  it('elegir el modo por roles cambia el selector a roles', async () => {
    const warData = draft();
    const interaction = createInteraction({ customId: 'pve_access_mode_select', values: ['ROLES'], isStringSelectMenu: () => true });

    await interactionHandler(interaction);

    expect(warData.accessMode).toBe('ROLES');
    expect(componentsJson(lastPayload(interaction.update))[1][0]).toMatchObject({ type: 6, custom_id: 'pve_access_roles_select' });
  });

  it('los roles elegidos se guardan como roles con acceso, sin tocar la lista de personas', async () => {
    const warData = draft({ accessMode: 'ROLES', allowedUserIds: ['ok_user'] });
    const interaction = createInteraction({ customId: 'pve_access_roles_select', values: ['role_a', 'role_b'], isRoleSelectMenu: () => true });

    await interactionHandler(interaction);

    expect(warData.allowedRoleIds).toEqual(['role_a', 'role_b']);
    expect(warData.allowedUserIds).toEqual(['ok_user']);
    expect(embedText(lastPayload(interaction.editReply))).toContain('<@&role_a> <@&role_b>');
  });

  it('@everyone no cuenta como rol con acceso', async () => {
    const warData = draft({ accessMode: 'ROLES' });
    const interaction = createInteraction({ customId: 'pve_access_roles_select', values: ['role_a', 'guild_1'], isRoleSelectMenu: () => true });

    await interactionHandler(interaction);

    expect(warData.allowedRoleIds).toEqual(['role_a']);
  });

  it('las personas que no ven el canal del evento, los bots y quien no esta en el servidor se descartan con aviso', async () => {
    const warData = draft({ accessMode: 'USERS' });
    const interaction = withChannelMembers(createInteraction({
      customId: 'pve_access_users_select',
      values: ['ok_user', 'hidden_user', 'bot_user', 'ghost_user'],
      isUserSelectMenu: () => true
    }));

    await interactionHandler(interaction);

    expect(warData.allowedUserIds).toEqual(['ok_user']);
    const text = embedText(lastPayload(interaction.editReply));
    expect(text).toContain('<@hidden_user>');
    expect(text).toContain('<@bot_user>');
    expect(text).toContain('<@ghost_user>');
  });
});

describe('acceso PvE en el panel /event edit', () => {
  let pveActions;
  let management;
  let pveWar;

  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
    pveWar = { ...buildWar({ id: 'pve_1', messageId: null, channelId: 'channel_1' }), eventType: 'pve', accessMode: 'ROLES', allowedUserIds: [], allowedRoleIds: [] };

    management = requireSrc('src/services/eventManagementService');
    management.getEventById = vi.fn(() => pveWar);
    management.updatePveAccess = vi.fn(async (eventId, access) => {
      pveWar = { ...pveWar, ...access };
      return { ok: true, event: pveWar, promoted: [{ userId: 'f1', displayName: 'Filler Uno', optionLabel: '20:00' }] };
    });
    pveActions = requireSrc('src/handlers/interaction/pveEventAdminPanelActions').PVE_EVENT_ADMIN_PANEL_ACTIONS;
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext('user_1', 'guild_1', 'channel_1', pveWar.id, {});
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  it('los roles elegidos se guardan y los fillers se reevaluan con los roles de cada miembro', async () => {
    const interaction = withChannelMembers(asAdmin(createInteraction({
      customId: 'panel_pve_access_roles_select',
      values: ['role_ok'],
      isRoleSelectMenu: () => true
    })));

    await pveActions.panel_pve_access_roles_select(interaction);

    const [eventId, access, filter, options] = management.updatePveAccess.mock.calls[0];
    expect(eventId).toBe('pve_1');
    expect(access).toEqual({ allowedRoleIds: ['role_ok'] });
    expect(filter).toEqual({ channelId: 'channel_1' });
    expect(await options.resolveMemberRoleIds('role_user')).toEqual(['role_ok']);
    expect(await options.resolveMemberRoleIds('ghost_user')).toEqual([]);
    const text = embedText(lastPayload(interaction.editReply));
    expect(text).toContain('<@&role_ok>');
    expect(text).toContain('Pasan a titulares: Filler Uno (20:00)');
  });

  it('las personas que no ven el canal del evento no se guardan', async () => {
    const interaction = withChannelMembers(asAdmin(createInteraction({
      customId: 'panel_pve_access_users_select',
      values: ['ok_user', 'hidden_user'],
      isUserSelectMenu: () => true
    })));

    await pveActions.panel_pve_access_users_select(interaction);

    expect(management.updatePveAccess.mock.calls[0][1]).toEqual({ allowedUserIds: ['ok_user'] });
    expect(embedText(lastPayload(interaction.editReply))).toContain('<@hidden_user>');
  });

  it('@everyone no cuenta como rol con acceso', async () => {
    const interaction = withChannelMembers(asAdmin(createInteraction({
      customId: 'panel_pve_access_roles_select',
      values: ['role_ok', 'guild_1'],
      isRoleSelectMenu: () => true
    })));

    await pveActions.panel_pve_access_roles_select(interaction);

    expect(management.updatePveAccess.mock.calls[0][1]).toEqual({ allowedRoleIds: ['role_ok'] });
  });
});

describe('cancelar un evento PvE desde el panel', () => {
  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  it('registra la cancelacion para que el cierre no promueva fillers ni abra votacion', async () => {
    const war = { ...buildWar({ id: 'pve_cancel', messageId: 'message_pve', channelId: 'channel_1' }), eventType: 'pve' };
    const reviewService = requireSrc('src/services/pveCloseReviewService');
    reviewService.cancelCloseReview = vi.fn(async () => undefined);
    const warService = requireSrc('src/services/warService');
    warService.getWarById = vi.fn(() => war);
    warService.loadWars = vi.fn(() => [war]);
    warService.updateWarById = vi.fn(async (id, mutator) => {
      mutator(war);
      return { war, result: undefined };
    });
    requireSrc('src/services/discordEventSyncService').updateEventDiscordMessage = vi.fn(async () => ({ ok: true }));
    const { EVENT_ADMIN_PANEL_ACTIONS } = requireSrc('src/handlers/interaction/eventAdminPanelActions');
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext('user_1', 'guild_1', 'channel_1', war.id, {});

    await EVENT_ADMIN_PANEL_ACTIONS.panel_event_cancel_confirm(asAdmin(createInteraction({ customId: 'panel_event_cancel_confirm' })));

    expect(war.isClosed).toBe(true);
    expect(reviewService.cancelCloseReview).toHaveBeenCalledWith(war);
  });
});

describe('publicacion de un borrador PvE con acceso restringido', () => {
  beforeEach(() => resetSrcModules());

  it('salta el paso de elegir roles a mencionar y muestra a quienes se mencionara', async () => {
    const { showScheduleMentionsSelector } = requireSrc('src/handlers/modal/scheduleFlow');
    const interaction = createInteraction();
    interaction.guild.roles.fetch = vi.fn(async () => createCollection());
    const warData = { name: 'Boss', eventType: 'pve', time: '20:00', duration: 60, timezone: 'UTC', accessMode: 'ROLES', allowedRoleIds: ['role_a'], recap: { enabled: false } };

    await showScheduleMentionsSelector(interaction, warData, [2]);

    expect(interaction.guild.roles.fetch).not.toHaveBeenCalled();
    const payload = lastPayload(interaction.editReply);
    const text = embedText(payload);
    expect(text).toContain('Confirmar publicacion');
    expect(text).toContain('<@&role_a>');
    expect(text).toContain('Por roles');
    // "Volver a editar" lleva a los dias: no hay paso de menciones al que volver.
    expect(componentsJson(payload)[0].map(button => button.custom_id)).toContain('edit_schedule_days');
  });
});
