const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { prisma } = require('../../src/db/client');
const { buildWar, buildWarRole } = require('../factories/warFactory');
const { getRoleByName, addParticipantToRole } = require('../../src/utils/warState');
const buttonHandler = require('../../src/handlers/buttonHandler');
const {
  initScheduler,
  stopScheduler,
  checkAndExecuteEvents
} = require('../../src/services/schedulerService');

setupIntegrationSuite();

async function createExternalEvent({ id, messageId, closesAt, expiresAt }) {
  await prisma.guild.upsert({ where: { id: 'guild_1' }, update: {}, create: { id: 'guild_1' } });
  await prisma.event.create({
    data: {
      id,
      eventType: 'war',
      accessMode: 'OPEN',
      name: 'Publicado desde la web',
      type: 'Node War',
      creatorId: 'user_web',
      guildId: 'guild_1',
      channelId: 'channel_web',
      messageId,
      timezone: 'America/Santiago',
      duration: 60,
      closeBeforeMinutes: 0,
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
      closesAt,
      expiresAt,
      isClosed: false,
      roleSlots: { create: [{ position: 0, name: 'Flex', max: 5 }] },
      schedule: { create: { enabled: false, mode: 'once' } },
      recap: { create: { enabled: false, minutesBeforeExpire: 0, messageText: '' } }
    }
  });
}

function createDiscordMocks() {
  const edits = [];
  const message = { edit: async payload => edits.push(payload), delete: async () => null };
  const channel = {
    send: async () => ({ id: 'unexpected_send' }),
    messages: { fetch: async () => message }
  };
  return { channel, edits, client: { channels: { fetch: async () => channel } } };
}

function buildJoinInteraction(messageId, channel) {
  return {
    customId: 'join_0',
    isButton: () => true,
    user: { id: 'core_sync_user', username: 'sync' },
    member: { displayName: 'Sync User', roles: { cache: new Map() } },
    message: { id: messageId },
    guildId: 'guild_1',
    guild: { channels: { fetch: async () => channel } },
    client: {},
    deferUpdate: vi.fn(async () => null),
    followUp: vi.fn(async () => null),
    reply: vi.fn(async () => null)
  };
}

describe('core: la cache del bot se entera de lo que escribe el dashboard', () => {
  afterEach(() => {
    stopScheduler();
  });

  it('un evento publicado por fuera admite inscripciones desde el boton', async () => {
    await createExternalEvent({
      id: 'core_sync_web_join',
      messageId: 'core_sync_web_msg_1',
      closesAt: new Date(Date.now() + 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 90 * 60 * 1000)
    });
    const { channel } = createDiscordMocks();
    const interaction = buildJoinInteraction('core_sync_web_msg_1', channel);

    await buttonHandler(interaction);

    expect(interaction.followUp.mock.calls.map(call => call[0].content)).not.toContain('No se encontro el evento');
    const participants = await prisma.eventParticipant.findMany({ where: { eventId: 'core_sync_web_join' } });
    expect(participants.map(row => row.userId)).toEqual(['core_sync_user']);
  });

  it('el scheduler cierra un evento publicado por fuera cuando vence closesAt', async () => {
    await createExternalEvent({
      id: 'core_sync_web_close',
      messageId: 'core_sync_web_msg_2',
      closesAt: new Date(Date.now() - 60 * 1000),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const { client, edits } = createDiscordMocks();

    initScheduler(client);
    await checkAndExecuteEvents();

    const row = await prisma.event.findUnique({ where: { id: 'core_sync_web_close' } });
    expect(row.isClosed).toBe(true);
    expect(edits.length).toBeGreaterThan(0);
  });

  it('un nombre cambiado por fuera se mantiene tras una inscripcion', async () => {
    const war = buildWar({ id: 'core_sync_rename', roles: [buildWarRole({ name: 'Flex', max: 5 })] });
    await warService.createWar(war);
    await prisma.event.update({ where: { id: war.id }, data: { name: 'Renombrado en la web' } });

    const { war: updated } = await warService.updateWarByMessageId(war.messageId, state => {
      addParticipantToRole(getRoleByName(state, 'Flex'), { userId: 'core_sync_joiner', displayName: 'J', isFake: false });
    });

    expect(updated.name).toBe('Renombrado en la web');
    const row = await prisma.event.findUnique({ where: { id: war.id } });
    expect(row.name).toBe('Renombrado en la web');
    expect(updated.roles[0].users.map(user => user.userId)).toEqual(['core_sync_joiner']);
  });

  it('un evento borrado por fuera desaparece de la cache en el siguiente tick', async () => {
    const war = buildWar({ id: 'core_sync_deleted' });
    await warService.createWar(war);
    await prisma.event.delete({ where: { id: war.id } });
    const { client } = createDiscordMocks();

    initScheduler(client);
    await checkAndExecuteEvents();

    expect(warService.loadWars().some(entry => entry.id === war.id)).toBe(false);
    const result = await warService.updateWarByMessageId(war.messageId, () => ({ type: 'noop' }));
    expect(result.war).toBeNull();
  });
});
