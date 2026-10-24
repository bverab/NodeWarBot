const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, asAdmin, createModalFields } = require('../support/interaction/fakes');
const { buildWar, buildWarRole, buildParticipant } = require('../factories/warFactory');

function waitlistEntry(userId, roleName, joinedAt) {
  return { userId, userName: `Name ${userId}`, roleName, joinedAt, isFake: false };
}

function buildWaitlistedWar() {
  return buildWar({
    id: 'war_wl_1',
    messageId: 'message_wl',
    roles: [
      buildWarRole({ name: 'Tank', max: 1, users: [buildParticipant({ userId: 'u_tank' })] }),
      buildWarRole({ name: 'Heal', max: 1, users: [buildParticipant({ userId: 'u_heal' })] })
    ],
    waitlist: [
      waitlistEntry('w1', 'Tank', 1),
      waitlistEntry('w2', 'Tank', 2),
      waitlistEntry('w3', 'Tank', 3),
      waitlistEntry('w4', 'Heal', 4)
    ]
  });
}

function patchServices(war) {
  const warService = requireSrc('src/services/warService');
  warService.loadWars = vi.fn(() => [war]);
  warService.updateWar = vi.fn(async updated => updated);
  const discordSync = requireSrc('src/services/discordEventSyncService');
  discordSync.updateEventDiscordMessage = vi.fn(async () => ({ ok: true }));
  const notifier = requireSrc('src/utils/promotionNotifier');
  notifier.notifyPromotion = vi.fn(async () => null);
  return { warService, discordSync, notifier };
}

describe('subir slots promueve la waitlist (H-11, C-15)', () => {
  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  it('panel: subir slots de 1 a 4 mueve a los 3 de la waitlist al rol y notifica a cada uno', async () => {
    const war = buildWaitlistedWar();
    const { warService, notifier } = patchServices(war);
    const { EVENT_ADMIN_MODAL_ACTIONS } = requireSrc('src/handlers/modal/eventAdminModalActions');
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext(
      'user_1', 'guild_1', 'channel_1', war.id, { selectedRoleIndex: 0, scope: 'single' }
    );
    const interaction = asAdmin(createInteraction({
      customId: 'panel_event_role_slots_modal',
      isModalSubmit: () => true,
      fields: createModalFields({ panel_event_role_slots_value: '4' })
    }));

    await EVENT_ADMIN_MODAL_ACTIONS.panel_event_role_slots_modal(interaction);

    const persisted = warService.updateWar.mock.calls[0][0];
    const tank = persisted.roles.find(role => role.name === 'Tank');
    expect(tank.max).toBe(4);
    expect(tank.users.map(user => user.userId)).toEqual(['u_tank', 'w1', 'w2', 'w3']);
    expect(persisted.waitlist.map(entry => entry.userId)).toEqual(['w4']);
    expect(notifier.notifyPromotion).toHaveBeenCalledTimes(3);
    expect(notifier.notifyPromotion.mock.calls.map(call => call[2].userId)).toEqual(['w1', 'w2', 'w3']);
  });

  it('panel: subir solo un cupo promueve solo al primero de la fila del rol', async () => {
    const war = buildWaitlistedWar();
    const { warService, notifier } = patchServices(war);
    const { EVENT_ADMIN_MODAL_ACTIONS } = requireSrc('src/handlers/modal/eventAdminModalActions');
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext(
      'user_1', 'guild_1', 'channel_1', war.id, { selectedRoleIndex: 0, scope: 'single' }
    );
    const interaction = asAdmin(createInteraction({
      customId: 'panel_event_role_slots_modal',
      isModalSubmit: () => true,
      fields: createModalFields({ panel_event_role_slots_value: '2' })
    }));

    await EVENT_ADMIN_MODAL_ACTIONS.panel_event_role_slots_modal(interaction);

    const persisted = warService.updateWar.mock.calls[0][0];
    expect(persisted.roles[0].users.map(user => user.userId)).toEqual(['u_tank', 'w1']);
    expect(persisted.waitlist.map(entry => entry.userId)).toEqual(['w2', 'w3', 'w4']);
    expect(notifier.notifyPromotion).toHaveBeenCalledTimes(1);
  });

  it('/eventadmin role_slots tambien promueve desde la waitlist', async () => {
    const war = buildWaitlistedWar();
    const { warService, notifier } = patchServices(war);
    const eventadmin = requireSrc('src/commands/eventadmin');
    const interaction = asAdmin(createInteraction({
      isAutocomplete: () => false,
      options: {
        getSubcommand: () => 'role_slots',
        getString: name => (name === 'rol' ? 'Tank' : war.id),
        getInteger: () => 4
      }
    }));

    await eventadmin.execute(interaction);

    const persisted = warService.updateWar.mock.calls[0][0];
    expect(persisted.roles[0].users.map(user => user.userId)).toEqual(['u_tank', 'w1', 'w2', 'w3']);
    expect(persisted.waitlist.map(entry => entry.userId)).toEqual(['w4']);
    expect(notifier.notifyPromotion).toHaveBeenCalledTimes(3);
  });
});

describe('borrar un rol limpia su waitlist (H-11)', () => {
  beforeEach(() => {
    resetSrcModules();
    global.eventAdminSelections = {};
  });

  afterEach(() => {
    delete global.eventAdminSelections;
  });

  it('panel: eliminar el rol Tank deja solo las entradas de waitlist de otros roles', async () => {
    const war = buildWaitlistedWar();
    const { warService } = patchServices(war);
    const { EVENT_ADMIN_PANEL_ACTIONS } = requireSrc('src/handlers/interaction/eventAdminPanelActions');
    requireSrc('src/utils/eventAdminContextStore').setSelectedEventContext(
      'user_1', 'guild_1', 'channel_1', war.id, { selectedRoleIndex: 0, scope: 'single' }
    );
    const interaction = asAdmin(createInteraction({ customId: 'panel_event_role_delete' }));

    await EVENT_ADMIN_PANEL_ACTIONS.panel_event_role_delete(interaction);

    const persisted = warService.updateWar.mock.calls[0][0];
    expect(persisted.roles.map(role => role.name)).toEqual(['Heal']);
    expect(persisted.waitlist.map(entry => entry.userId)).toEqual(['w4']);
  });
});
