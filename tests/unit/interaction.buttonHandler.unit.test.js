const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, collectReplies } = require('../support/interaction/fakes');
const { buildWar, buildWarRole, buildParticipant } = require('../factories/warFactory');

/**
 * Carga buttonHandler con warService simulado en memoria (updateWarByMessageId aplica el
 * updater real sobre una copia y la "persiste") para probar la logica de los botones publicos.
 */
function setup({ war, refreshResult = { ok: true } }) {
  resetSrcModules();
  const state = { war };

  const warService = requireSrc('src/services/warService');
  warService.getWarByMessageId = vi.fn(() => state.war);
  warService.updateWarByMessageId = vi.fn(async (messageId, updater) => {
    const draft = structuredClone(state.war);
    const result = updater(draft);
    state.war = draft;
    return { war: draft, result };
  });
  warService.deleteWarByMessageId = vi.fn();

  const discordSync = requireSrc('src/services/discordEventSyncService');
  discordSync.updateEventDiscordMessage = vi.fn(async () => refreshResult);
  discordSync.deleteEventDiscordMessage = vi.fn(async () => ({ ok: true }));

  const notifier = requireSrc('src/utils/promotionNotifier');
  notifier.notifyPromotion = vi.fn(async () => null);

  const buttonHandler = requireSrc('src/handlers/buttonHandler');
  return { state, warService, discordSync, notifier, buttonHandler };
}

function buildButtonInteraction(customId, overrides = {}) {
  return createInteraction({
    customId,
    isButton: () => true,
    message: { id: 'message_1', edit: vi.fn(async () => null) },
    ...overrides
  });
}

describe('buttonHandler: re-clic en un rol lleno no mueve la posicion en la waitlist (H-10)', () => {
  function buildFullTankWar() {
    return buildWar({
      id: 'war_h10',
      messageId: 'message_1',
      roles: [
        buildWarRole({ name: 'Tank', max: 1, users: [buildParticipant({ userId: 'u_tank' })] }),
        buildWarRole({ name: 'Heal', max: 1, users: [buildParticipant({ userId: 'u_heal' })] })
      ],
      waitlist: [{ userId: 'w0', userName: 'Primero', roleName: 'Tank', joinedAt: 1, isFake: false }]
    });
  }

  it('dos clics en un rol lleno dejan al usuario en la misma posicion y responden "Ya estas en la lista de espera"', async () => {
    const { buttonHandler, state } = setup({ war: buildFullTankWar() });

    const first = buildButtonInteraction('join_0');
    await buttonHandler(first);
    expect(collectReplies(first).join('\n')).toContain('Rol lleno. Te agregue a la waitlist (#2)');

    // Otro usuario entra despues a la misma waitlist.
    const other = buildButtonInteraction('join_0', { user: { id: 'user_3', username: 'user3' } });
    await buttonHandler(other);
    expect(state.war.waitlist.map(entry => entry.userId)).toEqual(['w0', 'user_1', 'user_3']);

    const second = buildButtonInteraction('join_0');
    await buttonHandler(second);

    expect(state.war.waitlist.map(entry => entry.userId)).toEqual(['w0', 'user_1', 'user_3']);
    expect(collectReplies(second).join('\n')).toContain('Ya estas en la lista de espera');
  });

  it('cambiar a la waitlist de otro rol lleno sigue moviendo al usuario (una sola entrada)', async () => {
    const { buttonHandler, state } = setup({ war: buildFullTankWar() });

    await buttonHandler(buildButtonInteraction('join_0'));
    const toHeal = buildButtonInteraction('join_1');
    await buttonHandler(toHeal);

    const mine = state.war.waitlist.filter(entry => entry.userId === 'user_1');
    expect(mine).toHaveLength(1);
    expect(mine[0].roleName).toBe('Heal');
    expect(collectReplies(toHeal).join('\n')).toContain('Rol lleno. Te agregue a la waitlist');
  });
});

describe('buttonHandler: refresco del mensaje tras persistir (H-8)', () => {
  it('si el refresco falla, el usuario inscrito igual ve "Te uniste" y no "Error interno"', async () => {
    const war = buildWar({
      id: 'war_h8_join',
      messageId: 'message_1',
      roles: [buildWarRole({ name: 'Tank', max: 2 })]
    });
    const { buttonHandler, state } = setup({ war, refreshResult: { ok: false, status: 'missing_message', errorMessage: 'gone' } });
    const interaction = buildButtonInteraction('join_0');

    await buttonHandler(interaction);

    const replies = collectReplies(interaction).join('\n');
    expect(replies).toContain('Te uniste a **Tank**');
    expect(replies).not.toContain('Error interno');
    expect(state.war.roles[0].users.map(user => user.userId)).toContain('user_1');
  });

  it('si el refresco falla, la promocion de la waitlist igual se notifica', async () => {
    const war = buildWar({
      id: 'war_h8_promote',
      messageId: 'message_1',
      roles: [buildWarRole({ name: 'Tank', max: 1, users: [buildParticipant({ userId: 'user_1' })] })],
      waitlist: [{ userId: 'user_2', userName: 'Segundo', roleName: 'Tank', joinedAt: 1, isFake: false }]
    });
    const { buttonHandler, notifier, state } = setup({ war, refreshResult: { ok: false, status: 'error', errorMessage: 'boom' } });
    const interaction = buildButtonInteraction('join_0');

    await buttonHandler(interaction);

    const replies = collectReplies(interaction).join('\n');
    expect(replies).toContain('Te retiraste de **Tank**');
    expect(replies).not.toContain('Error interno');
    expect(notifier.notifyPromotion).toHaveBeenCalledTimes(1);
    expect(notifier.notifyPromotion.mock.calls[0][2]).toMatchObject({ userId: 'user_2', roleName: 'Tank' });
    expect(state.war.roles[0].users.map(user => user.userId)).toEqual(['user_2']);
  });

  it('con refresco correcto el comportamiento no cambia', async () => {
    const war = buildWar({
      id: 'war_h8_ok',
      messageId: 'message_1',
      roles: [buildWarRole({ name: 'Tank', max: 2 })]
    });
    const { buttonHandler, discordSync } = setup({ war });
    const interaction = buildButtonInteraction('join_0');

    await buttonHandler(interaction);

    expect(discordSync.updateEventDiscordMessage).toHaveBeenCalledTimes(1);
    expect(collectReplies(interaction).join('\n')).toContain('Te uniste a **Tank**');
  });
});
