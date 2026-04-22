const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const {
  createWar,
  loadWars,
  getWarByMessageId,
  getLatestWarByChannelId,
  updateWar,
  deleteWarByMessageId
} = require('../../src/db/warRepository');
const { buildWar, buildWarRole, buildParticipant } = require('../factories/warFactory');

setupIntegrationSuite();

describe('WarRepository integration', () => {
  it('crea y lee evento con schedule, roles, menciones y recap', async () => {
    const war = buildWar({
      roles: [
        buildWarRole({
          name: 'Caller',
          max: 1,
          users: [buildParticipant({ userId: 'u1', displayName: 'Caller1' })]
        }),
        buildWarRole({ name: 'DPS', max: 2 })
      ],
      notifyRoles: ['role_a', 'role_b'],
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: Date.now(), lastMessageIdDeleted: null },
      recap: { enabled: true, minutesBeforeExpire: 10, messageText: 'Recap test', threadId: null, lastPostedAt: null }
    });

    await createWar(war);
    const loaded = getWarByMessageId(war.messageId);

    expect(loaded).toBeTruthy();
    expect(loaded.id).toBe(war.id);
    expect(loaded.schedule.enabled).toBe(true);
    expect(loaded.roles.length).toBe(2);
    expect(loaded.roles[0].users[0].userId).toBe('u1');
    expect(loaded.notifyRoles).toEqual(['role_a', 'role_b']);
    expect(loaded.recap.messageText).toBe('Recap test');
  });

  it('edita evento y persiste cambios', async () => {
    const war = buildWar({ type: 'OriginalType', isClosed: false });
    await createWar(war);

    const edited = { ...war, type: 'EditedType', isClosed: true };
    const updated = await updateWar(edited);
    const loaded = getWarByMessageId(war.messageId);

    expect(updated.type).toBe('EditedType');
    expect(loaded.type).toBe('EditedType');
    expect(loaded.isClosed).toBe(true);
  });

  it('elimina evento por messageId', async () => {
    const war = buildWar();
    await createWar(war);
    const removed = await deleteWarByMessageId(war.messageId);
    const loaded = getWarByMessageId(war.messageId);

    expect(removed).toBe(true);
    expect(loaded).toBeNull();
  });

  it('recupera ultimo evento por canal y createdAt', async () => {
    const channelId = 'channel_latest';
    const first = buildWar({ channelId, createdAt: 1000, messageId: 'msg_first' });
    const second = buildWar({ channelId, createdAt: 2000, messageId: 'msg_second' });
    await createWar(first);
    await createWar(second);

    const latest = getLatestWarByChannelId(channelId);
    expect(latest).toBeTruthy();
    expect(latest.id).toBe(second.id);
  });

  it('mantiene estructura consistente al listar todos', async () => {
    await createWar(buildWar({ messageId: 'msg_1' }));
    await createWar(buildWar({ messageId: 'msg_2' }));

    const wars = loadWars();
    expect(wars.length).toBe(2);
    expect(wars.every(w => Array.isArray(w.roles))).toBe(true);
  });
});
