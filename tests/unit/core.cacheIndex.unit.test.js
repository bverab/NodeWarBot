const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');

const N = 300;

function buildDbRow(index) {
  const now = Date.parse('2026-05-05T20:00:00.000Z');
  return {
    id: `core_index_${index}`,
    groupId: `core_group_${index % 10}`,
    eventType: 'war',
    accessMode: 'OPEN',
    name: `Evento ${index}`,
    type: 'Node War',
    classIconSource: 'bot',
    participantDisplayStyle: 'modern',
    creatorId: 'creator',
    guildId: 'guild_1',
    channelId: `channel_${index % 5}`,
    messageId: `core_msg_${index}`,
    dayOfWeek: index % 7,
    time: '20:00',
    timezone: 'America/Santiago',
    duration: 70,
    closeBeforeMinutes: 10,
    autoPublishEnabled: false,
    scheduledPublishAt: null,
    publishError: null,
    lastPublishAttemptAt: null,
    createdAt: new Date(now + index),
    expiresAt: new Date(now + 70 * 60 * 1000),
    closesAt: new Date(now + 60 * 60 * 1000),
    isClosed: false,
    updatedAt: new Date(now),
    roleSlots: [{ name: 'Flex', max: 5, emoji: null, emojiSource: null, users: [], permissions: [] }],
    waitlist: [],
    notifyTargets: [],
    accessRoles: [],
    accessUsers: [],
    fillers: [],
    schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null },
    recap: { enabled: false, minutesBeforeExpire: 0, messageText: '', threadId: null, lastPostedAt: null }
  };
}

async function loadRepositoryWithCountingNormalize() {
  resetSrcModules();
  const client = requireSrc('src/db/client');
  client.prisma = { event: { findMany: vi.fn(async () => Array.from({ length: N }, (_, index) => buildDbRow(index))) } };
  const warState = requireSrc('src/utils/warState');
  const original = warState.normalizeWar;
  const counter = { calls: 0 };
  warState.normalizeWar = (...args) => {
    counter.calls += 1;
    return original(...args);
  };
  const repository = requireSrc('src/db/warRepository');
  await repository.initializeWarRepository();
  counter.calls = 0;
  return { repository, counter };
}

describe('core: lecturas de la cache sin clonar todos los eventos', () => {
  afterEach(() => {
    resetSrcModules();
  });

  it('getWarByMessageId normaliza solo el evento encontrado', async () => {
    const { repository, counter } = await loadRepositoryWithCountingNormalize();

    const war = repository.getWarByMessageId('core_msg_123');

    expect(war.id).toBe('core_index_123');
    expect(counter.calls).toBe(1);
    expect(repository.getWarByMessageId('no_existe')).toBeNull();
  });

  it('los getters por grupo, dia y canal clonan solo los eventos que devuelven', async () => {
    const { repository, counter } = await loadRepositoryWithCountingNormalize();

    const group = repository.getWarsByGroupId('core_group_3');
    expect(group).toHaveLength(N / 10);
    expect(counter.calls).toBe(N / 10);

    counter.calls = 0;
    expect(repository.getWarByGroupAndDay('core_group_3', 3)?.groupId).toBe('core_group_3');
    expect(counter.calls).toBe(1);

    counter.calls = 0;
    expect(repository.getLatestWarByChannelId('channel_2').id).toBe('core_index_297');
    expect(counter.calls).toBe(1);

    counter.calls = 0;
    expect(repository.getEditableWarsForAutocomplete()).toHaveLength(N);
    expect(counter.calls).toBe(0);
  });

  it('una copia devuelta no altera la cache', async () => {
    const { repository } = await loadRepositoryWithCountingNormalize();

    const war = repository.getWarByMessageId('core_msg_5');
    war.name = 'mutado';
    war.roles[0].users.push({ userId: 'x', displayName: 'x', isFake: false });

    const again = repository.getWarByMessageId('core_msg_5');
    expect(again.name).toBe('Evento 5');
    expect(again.roles[0].users).toEqual([]);
  });
});
