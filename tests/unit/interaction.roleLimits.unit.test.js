const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { routeUpdateWarByIdThroughUpdateWar } = require('../helpers/warServiceMocks');
const { createInteraction, asAdmin, createModalFields, collectReplies } = require('../support/interaction/fakes');
const { buildWar, buildWarRole } = require('../factories/warFactory');

function draftRoles(count, prefix = 'Rol') {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix}${index + 1}`,
    max: 2,
    emoji: null,
    emojiSource: null,
    users: [],
    allowedRoleIds: [],
    allowedRoles: []
  }));
}

describe('limites de roles: helpers (H-9, C-4)', () => {
  const { MAX_ROLES } = require('../../src/constants/eventLimits');
  const { validateNewRoles, hasDuplicateRoleName } = require('../../src/utils/roleLimits');

  it('MAX_ROLES son 20 (5 filas de botones menos la fila de gestion)', () => {
    expect(MAX_ROLES).toBe(20);
  });

  it('acepta hasta 20 roles en total', () => {
    expect(validateNewRoles(draftRoles(17), draftRoles(3, 'Nuevo')).ok).toBe(true);
  });

  it('rechaza pasar de 20 roles con un mensaje claro', () => {
    const result = validateNewRoles(draftRoles(18), draftRoles(3, 'Nuevo'));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('20');
  });

  it('rechaza nombres repetidos sin distinguir mayusculas, tambien dentro del mismo lote', () => {
    expect(validateNewRoles([{ name: 'Tank' }], [{ name: 'tank', max: 1 }]).ok).toBe(false);
    expect(validateNewRoles([], [{ name: 'A', max: 1 }, { name: 'a ', max: 2 }]).ok).toBe(false);
  });

  it.each([0, -1, 1000, 1.5, NaN, undefined])('rechaza slots invalidos (%s)', slots => {
    expect(validateNewRoles([], [{ name: 'A', max: slots }]).ok).toBe(false);
  });

  it('acepta slots entre 1 y 999', () => {
    expect(validateNewRoles([], [{ name: 'A', max: 1 }, { name: 'B', max: 999 }]).ok).toBe(true);
  });

  it('hasDuplicateRoleName ignora el propio rol', () => {
    const roles = [{ name: 'Tank' }, { name: 'Heal' }];
    expect(hasDuplicateRoleName(roles, 'TANK', 1)).toBe(true);
    expect(hasDuplicateRoleName(roles, 'TANK', 0)).toBe(false);
    expect(hasDuplicateRoleName(roles, 'Nuevo')).toBe(false);
  });
});

describe('modal masivo de roles del borrador (H-9, C-4)', () => {
  let modalHandler;

  beforeEach(() => {
    resetSrcModules();
    global.warEdits = {};
    modalHandler = requireSrc('src/handlers/modalHandler');
  });

  afterEach(() => {
    delete global.warEdits;
  });

  function submitBulk(text) {
    return createInteraction({
      customId: 'add_roles_bulk_modal',
      isModalSubmit: () => true,
      fields: createModalFields({ roles_text: text })
    });
  }

  function setDraft(roles) {
    global.warEdits.user_1 = { creatorId: 'user_1', eventType: 'war', name: 'Borrador', timezone: 'America/Bogota', roles };
  }

  it('21 roles en un solo envio se rechazan y no se agrega ninguno', async () => {
    setDraft([]);
    const text = Array.from({ length: 21 }, (_, i) => `Rol${i + 1}: 2`).join('\n');
    const interaction = submitBulk(text);

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles).toHaveLength(0);
    expect(collectReplies(interaction).join('\n')).toContain('20');
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it('agregar roles que superan 20 en total se rechaza sin tocar el borrador', async () => {
    setDraft(draftRoles(19));
    const interaction = submitBulk('Extra1: 1\nExtra2: 1');

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles).toHaveLength(19);
    expect(collectReplies(interaction).join('\n')).toContain('20');
  });

  it('un nombre que ya existe (otra capitalizacion) se rechaza', async () => {
    setDraft(draftRoles(1, 'Tank').map(role => ({ ...role, name: 'Tank' })));
    const interaction = submitBulk('tank: 2');

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles).toHaveLength(1);
    expect(collectReplies(interaction).join('\n')).toContain('Ya existe');
  });

  it('nombres repetidos dentro del mismo envio se rechazan', async () => {
    setDraft([]);
    const interaction = submitBulk('Dosa: 2\ndosa: 3');

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles).toHaveLength(0);
    expect(collectReplies(interaction).join('\n')).toContain('Ya existe');
  });

  it('slots fuera de 1-999 se rechazan con mensaje claro', async () => {
    setDraft([]);
    const interaction = submitBulk('Dosa: 1000');

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles).toHaveLength(0);
    expect(collectReplies(interaction).join('\n')).toContain('999');
  });

  it('un envio valido sigue agregando los roles y mostrando el editor', async () => {
    setDraft([]);
    const interaction = submitBulk('Dosa: 3\nTanque: 999\nSoporte: 1');

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles.map(role => [role.name, role.max])).toEqual([
      ['Dosa', 3],
      ['Tanque', 999],
      ['Soporte', 1]
    ]);
    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
  });

  it('las lineas con formato invalido se siguen ignorando mientras haya una valida', async () => {
    setDraft([]);
    const interaction = submitBulk('esto no es un rol\nDosa: 3');

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles.map(role => role.name)).toEqual(['Dosa']);
  });
});

describe('edicion de roles del borrador: duplicados y rango de slots', () => {
  let modalHandler;

  beforeEach(() => {
    resetSrcModules();
    global.warEdits = {};
    global.warEditSelections = {};
    modalHandler = requireSrc('src/handlers/modalHandler');
    global.warEdits.user_1 = {
      creatorId: 'user_1',
      eventType: 'war',
      name: 'Borrador',
      roles: draftRoles(2, 'X').map((role, index) => ({ ...role, name: index === 0 ? 'Tank' : 'Heal' }))
    };
    global.warEditSelections.user_1 = 0;
  });

  afterEach(() => {
    delete global.warEdits;
    delete global.warEditSelections;
  });

  it('renombrar a un nombre que ya usa otro rol se rechaza', async () => {
    const interaction = createInteraction({
      customId: 'panel_edit_name_modal',
      fields: createModalFields({ panel_edit_name_input: 'heal' })
    });

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles[0].name).toBe('Tank');
    expect(collectReplies(interaction).join('\n')).toContain('Ya existe');
  });

  it('renombrar solo la capitalizacion del propio rol sigue permitido', async () => {
    const interaction = createInteraction({
      customId: 'panel_edit_name_modal',
      fields: createModalFields({ panel_edit_name_input: 'TANK' })
    });

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles[0].name).toBe('TANK');
  });

  it('slots mayores a 999 se rechazan', async () => {
    const interaction = createInteraction({
      customId: 'panel_edit_slots_modal',
      fields: createModalFields({ panel_edit_slots_input: '1000' })
    });

    await modalHandler(interaction);

    expect(global.warEdits.user_1.roles[0].max).toBe(2);
    expect(collectReplies(interaction).join('\n')).toContain('999');
  });
});

describe('roles de un evento ya publicado (H-9, C-4)', () => {
  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  function fullWar(count = 20) {
    return buildWar({
      id: 'war_full',
      messageId: 'message_full',
      roles: Array.from({ length: count }, (_, i) => buildWarRole({ name: `R${i + 1}`, max: 2 }))
    });
  }

  it('el panel no agrega un rol 21', async () => {
    const war = fullWar();
    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => [war]);
    warService.updateWar = vi.fn(async updated => updated);
    routeUpdateWarByIdThroughUpdateWar(warService);
    const { EVENT_ADMIN_MODAL_ACTIONS } = requireSrc('src/handlers/modal/eventAdminModalActions');
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext('user_1', 'guild_1', 'channel_1', war.id, {});
    const interaction = asAdmin(createInteraction({
      customId: 'panel_event_role_add_modal',
      fields: createModalFields({
        panel_event_role_add_name: 'Extra',
        panel_event_role_add_slots: '2',
        panel_event_role_add_icon: ''
      })
    }));

    await EVENT_ADMIN_MODAL_ACTIONS.panel_event_role_add_modal(interaction);

    expect(warService.updateWar).not.toHaveBeenCalled();
    expect(collectReplies(interaction).join('\n')).toContain('20');
  });

  it('el panel sigue agregando el rol 20', async () => {
    const war = fullWar(19);
    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => [war]);
    warService.updateWar = vi.fn(async updated => updated);
    routeUpdateWarByIdThroughUpdateWar(warService);
    const { EVENT_ADMIN_MODAL_ACTIONS } = requireSrc('src/handlers/modal/eventAdminModalActions');
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext('user_1', 'guild_1', 'channel_1', war.id, {});
    const interaction = asAdmin(createInteraction({
      customId: 'panel_event_role_add_modal',
      fields: createModalFields({
        panel_event_role_add_name: 'Extra',
        panel_event_role_add_slots: '2',
        panel_event_role_add_icon: ''
      })
    }));

    await EVENT_ADMIN_MODAL_ACTIONS.panel_event_role_add_modal(interaction);

    expect(warService.updateWar).toHaveBeenCalledTimes(1);
  });

  it('/eventadmin role_add no agrega un rol 21', async () => {
    const war = fullWar();
    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => [war]);
    warService.updateWar = vi.fn(async updated => updated);
    routeUpdateWarByIdThroughUpdateWar(warService);
    const eventadmin = requireSrc('src/commands/eventadmin');
    const interaction = asAdmin(createInteraction({
      isAutocomplete: () => false,
      options: {
        getSubcommand: () => 'role_add',
        getString: name => ({ nombre: 'Extra', icono: null, id: war.id }[name] ?? null),
        getInteger: () => 2
      }
    }));

    await eventadmin.execute(interaction);

    expect(warService.updateWar).not.toHaveBeenCalled();
    expect(interaction.editReply.mock.calls.map(call => call[0].content).join('\n')).toContain('20');
  });

  it('un evento existente con mas de 20 roles se sigue leyendo (no se invalida)', () => {
    const { normalizeWar } = requireSrc('src/utils/warState');
    const normalized = normalizeWar(fullWar(24));
    expect(normalized.roles).toHaveLength(24);
  });

  it('/editrole slots limita a 999 en la definicion del comando', () => {
    const editrole = requireSrc('src/commands/editrole');
    const slots = editrole.data.toJSON().options.find(option => option.name === 'slots');
    const quantity = slots.options.find(option => option.name === 'cantidad');
    expect(quantity.max_value).toBe(999);
  });
});
