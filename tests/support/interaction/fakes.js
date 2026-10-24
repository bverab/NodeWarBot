/**
 * Fakes minimos de discord.js para los tests de la fase "interaction".
 * No sustituyen a los builders reales: las respuestas se capturan con vi.fn().
 */

function createCollection(entries = []) {
  const map = new Map(entries);
  map.some = predicate => {
    for (const value of map.values()) {
      if (predicate(value)) return true;
    }
    return false;
  };
  return map;
}

function createMember({ displayName = 'User One', roles = [] } = {}) {
  return {
    displayName,
    roles: { cache: createCollection(roles.map(role => [role.id, role])) }
  };
}

function createInteraction(overrides = {}) {
  const interaction = {
    customId: 'test',
    user: { id: 'user_1', username: 'user1' },
    member: createMember(),
    memberPermissions: { has: () => false },
    guild: {
      id: 'guild_1',
      name: 'Guild',
      channels: { fetch: vi.fn(async () => null) },
      roles: { cache: createCollection() },
      emojis: { cache: createCollection() }
    },
    guildId: 'guild_1',
    channelId: 'channel_1',
    client: {},
    message: { id: 'msg_1', edit: vi.fn(async () => null) },
    values: [],
    deferred: false,
    replied: false,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isRoleSelectMenu: () => false,
    isUserSelectMenu: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    fields: { getTextInputValue: () => '' },
    reply: vi.fn(async () => {
      interaction.replied = true;
      return null;
    }),
    update: vi.fn(async () => {
      interaction.replied = true;
      return null;
    }),
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
      return null;
    }),
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
      return null;
    }),
    editReply: vi.fn(async () => null),
    followUp: vi.fn(async () => null),
    showModal: vi.fn(async () => null)
  };
  return Object.assign(interaction, overrides);
}

function asAdmin(interaction) {
  interaction.memberPermissions = { has: () => true };
  return interaction;
}

function createModalFields(values = {}) {
  return {
    getTextInputValue: id => (Object.prototype.hasOwnProperty.call(values, id) ? values[id] : '')
  };
}

/** Texto de todas las respuestas (reply/update/editReply/followUp) de una interaccion. */
function collectReplies(interaction) {
  const calls = [
    ...interaction.reply.mock.calls,
    ...interaction.update.mock.calls,
    ...interaction.editReply.mock.calls,
    ...interaction.followUp.mock.calls
  ];
  return calls.map(([payload]) => (typeof payload === 'string' ? payload : payload?.content || ''));
}

module.exports = {
  createCollection,
  createMember,
  createInteraction,
  createModalFields,
  asAdmin,
  collectReplies
};
