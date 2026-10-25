/**
 * Discord falso minimo para los tests de la revision de cierre PvE: canales, hilos, mensajes con
 * edit/delete/startThread y reacciones (message.reactions.resolve(emoji).users.fetch()).
 */
const BOT_USER = { id: 'bot_user', bot: true, username: 'bot' };

function createFakeDiscord() {
  const channels = new Map();
  let sequence = 0;

  function createMessage(channel, payload = {}, id = null) {
    sequence += 1;
    const message = {
      id: id || `fake_msg_${sequence}`,
      channelId: channel.id,
      content: payload.content || '',
      payload,
      edits: [],
      deleted: false,
      thread: null,
      reactionUsers: new Map()
    };
    message.edit = async next => {
      message.edits.push(next);
      if (typeof next?.content === 'string') message.content = next.content;
      message.payload = { ...message.payload, ...next };
      return message;
    };
    message.delete = async () => {
      message.deleted = true;
      channel.messages.store.delete(message.id);
    };
    message.react = async emoji => {
      addReaction(message, emoji, BOT_USER);
    };
    message.startThread = async ({ name }) => {
      const thread = createChannel(`fake_thread_${message.id}`, { name, parentId: channel.id });
      message.thread = thread;
      return thread;
    };
    message.reactions = {
      resolve: emoji => {
        const users = message.reactionUsers.get(emoji);
        if (!users) return null;
        return { emoji: { name: emoji }, users: { fetch: async () => new Map(Array.from(users.values()).map(user => [user.id, user])) } };
      }
    };
    channel.messages.store.set(message.id, message);
    channel.sent.push(message);
    return message;
  }

  function createChannel(id, extra = {}) {
    const channel = {
      id,
      ...extra,
      sent: [],
      messages: {
        store: new Map(),
        fetch: async messageId => channel.messages.store.get(String(messageId)) || null
      }
    };
    channel.send = async payload => createMessage(channel, payload);
    channels.set(id, channel);
    return channel;
  }

  function addReaction(message, emoji, user) {
    if (!message.reactionUsers.has(emoji)) message.reactionUsers.set(emoji, new Map());
    message.reactionUsers.get(emoji).set(user.id, user);
  }

  function removeReaction(message, emoji, user) {
    message.reactionUsers.get(emoji)?.delete(user.id);
  }

  const client = {
    user: BOT_USER,
    channels: { fetch: async id => channels.get(String(id)) || null }
  };

  // Evento de reaccion como lo entrega discord.js (sin parciales).
  function reactionEvent(message, emoji) {
    return { partial: false, emoji: { name: emoji }, message: { id: message.id, partial: false }, client };
  }

  return { client, channels, createChannel, createMessage, addReaction, removeReaction, reactionEvent };
}

module.exports = {
  BOT_USER,
  createFakeDiscord
};
