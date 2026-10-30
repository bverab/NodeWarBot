const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { confirmAndPublish } = require('../../src/handlers/modal/scheduleFlow');
const { setScheduleTemp } = require('../../src/utils/draftSessionStore');
const { publishOrRefreshWar } = require('../../src/services/eventPublicationService');
const { formatTimeInEventZone } = require('../../src/utils/eventLifecycleTimes');
const {
  initScheduler,
  stopScheduler,
  checkAndExecuteEvents
} = require('../../src/services/schedulerService');

setupIntegrationSuite();

const TIMEZONE = 'America/Santiago';
// Martes 2026-05-05 15:37 en Santiago (UTC-4): el borrador se confirma horas antes de las 22:00.
const CREATED_AT = new Date('2026-05-05T19:37:00.000Z');
const SLOT = new Date('2026-05-06T02:00:00.000Z'); // martes 22:00 en Santiago

function buildDraft(userId) {
  // Igual que el borrador que arma /event create (modalHandler).
  return {
    groupId: 'core_draft_group',
    eventType: 'war',
    name: 'Draft nocturno',
    type: 'Node War',
    classIconSource: 'bot',
    participantDisplayStyle: 'modern',
    timezone: TIMEZONE,
    time: '22:00',
    duration: 70,
    closeBeforeMinutes: 10,
    roles: [{ name: 'Flex', max: 5, users: [] }],
    waitlist: [],
    creatorId: userId,
    guildId: 'guild_1',
    createdAt: Date.now(),
    channelId: 'channel_draft',
    dayOfWeek: null,
    notifyRoles: [],
    schedule: { enabled: true, lastCreatedAt: null },
    recap: { enabled: false, minutesBeforeExpire: 0, messageText: '', threadId: null, lastPostedAt: null },
    isClosed: false,
    timeSlots: [],
    slotCapacity: 5,
    accessMode: 'OPEN',
    allowedUserIds: []
  };
}

async function confirmDraft(userId) {
  setScheduleTemp(userId, { mode: 'recurring', days: [2], mentions: [] });
  const interaction = {
    user: { id: userId },
    deferred: true,
    replied: false,
    editReply: vi.fn(async () => null)
  };
  await confirmAndPublish(interaction, buildDraft(userId), [2], []);
  return interaction;
}

function createChannelMocks() {
  const sent = [];
  const messages = new Map();
  const channel = {
    send: async payload => {
      sent.push(payload);
      const id = `core_draft_msg_${sent.length}`;
      messages.set(id, { id, edit: async () => null, delete: async () => messages.delete(id) });
      return { id };
    },
    messages: { fetch: async id => messages.get(String(id)) || null }
  };
  return { channel, sent };
}

describe('core: horas de cierre y fin de eventos creados en Discord', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(CREATED_AT);
  });

  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  it('confirmar el borrador guarda las horas de la primera ocurrencia', async () => {
    const interaction = await confirmDraft('core_draft_user_1');

    expect(interaction.editReply.mock.calls[0][0].content).toContain('Programacion creada');
    const war = warService.loadWars().find(entry => entry.id === 'core_draft_group_day2');
    expect(war.createdAt).toBe(SLOT.getTime());
    expect(formatTimeInEventZone(war.closesAt, TIMEZONE)).toBe('23:00');
    expect(formatTimeInEventZone(war.expiresAt, TIMEZONE)).toBe('23:10');
    expect(war.duration).toBe(70);
    expect(war.closeBeforeMinutes).toBe(10);

    const row = await prisma.event.findUnique({ where: { id: war.id } });
    expect(row.closesAt.getTime()).toBe(SLOT.getTime() + 60 * 60 * 1000);
    expect(row.expiresAt.getTime()).toBe(SLOT.getTime() + 70 * 60 * 1000);
  });

  it('el scheduler publica la ocurrencia con esas horas y no la cierra en el tick siguiente', async () => {
    await confirmDraft('core_draft_user_2');
    const { channel, sent } = createChannelMocks();

    vi.setSystemTime(SLOT);
    initScheduler({ channels: { fetch: async () => channel } });
    await checkAndExecuteEvents();

    let war = warService.loadWars().find(entry => entry.id === 'core_draft_group_day2');
    expect(sent.length).toBe(1);
    expect(war.messageId).toBe('core_draft_msg_1');
    expect(war.closesAt).toBe(SLOT.getTime() + 60 * 60 * 1000);
    expect(war.expiresAt).toBe(SLOT.getTime() + 70 * 60 * 1000);

    vi.setSystemTime(new Date(SLOT.getTime() + 60 * 1000));
    await checkAndExecuteEvents();

    war = warService.loadWars().find(entry => entry.id === 'core_draft_group_day2');
    expect(war.isClosed).toBe(false);
    expect(war.messageId).toBe('core_draft_msg_1');
  });

  it('publicar ahora (/event publish) sigue publicando la proxima ocurrencia', async () => {
    await confirmDraft('core_draft_user_3');
    const { channel, sent } = createChannelMocks();
    const war = warService.loadWars().find(entry => entry.id === 'core_draft_group_day2');

    const result = await publishOrRefreshWar({ guild: { channels: { fetch: async () => channel } } }, war);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('published');
    expect(sent.length).toBe(1);
    const persisted = warService.loadWars().find(entry => entry.id === war.id);
    expect(persisted.createdAt).toBe(SLOT.getTime());
    expect(persisted.closesAt).toBe(SLOT.getTime() + 60 * 60 * 1000);
    expect(persisted.expiresAt).toBe(SLOT.getTime() + 70 * 60 * 1000);
  });
});
