let warCounter = 0;
let messageCounter = 0;
let participantCounter = 0;

function buildParticipant(overrides = {}) {
  participantCounter += 1;
  return {
    userId: overrides.userId || `user_${participantCounter}`,
    displayName: overrides.displayName || `TestUser${participantCounter}`,
    isFake: Boolean(overrides.isFake)
  };
}

function buildWarRole(overrides = {}) {
  return {
    name: overrides.name || 'DPS',
    max: Number.isInteger(overrides.max) ? overrides.max : 2,
    emoji: overrides.emoji || null,
    emojiSource: overrides.emojiSource || null,
    users: Array.isArray(overrides.users) ? overrides.users : [],
    allowedRoleIds: Array.isArray(overrides.allowedRoleIds) ? overrides.allowedRoleIds : [],
    allowedRoles: Array.isArray(overrides.allowedRoles) ? overrides.allowedRoles : []
  };
}

function buildWar(overrides = {}) {
  warCounter += 1;
  messageCounter += 1;
  const now = Date.now() + warCounter;
  const roleDefaults = [buildWarRole({ name: 'Frontline', max: 1 }), buildWarRole({ name: 'Flex', max: 2 })];

  return {
    id: overrides.id || `war_test_${warCounter}`,
    groupId: overrides.groupId || `group_test_${warCounter}`,
    eventType: overrides.eventType || 'war',
    name: overrides.name || `Test War ${warCounter}`,
    type: overrides.type || 'Node War',
    classIconSource: overrides.classIconSource || 'bot',
    participantDisplayStyle: overrides.participantDisplayStyle || 'modern',
    roles: Array.isArray(overrides.roles) ? overrides.roles : roleDefaults,
    waitlist: Array.isArray(overrides.waitlist) ? overrides.waitlist : [],
    creatorId: overrides.creatorId || 'creator_1',
    guildId: overrides.guildId || 'guild_1',
    channelId: overrides.channelId || 'channel_1',
    messageId: Object.prototype.hasOwnProperty.call(overrides, 'messageId')
      ? overrides.messageId
      : `message_${messageCounter}`,
    dayOfWeek: Object.prototype.hasOwnProperty.call(overrides, 'dayOfWeek') ? overrides.dayOfWeek : 2,
    time: overrides.time || '20:00',
    timezone: overrides.timezone || 'America/Santiago',
    duration: Number.isInteger(overrides.duration) ? overrides.duration : 70,
    closeBeforeMinutes: Number.isInteger(overrides.closeBeforeMinutes) ? overrides.closeBeforeMinutes : 10,
    notifyRoles: Array.isArray(overrides.notifyRoles) ? overrides.notifyRoles : ['role_notify_1'],
    schedule: overrides.schedule || {
      enabled: true,
      mode: 'recurring',
      lastCreatedAt: now,
      lastMessageIdDeleted: null
    },
    recap: overrides.recap || {
      enabled: true,
      minutesBeforeExpire: 5,
      messageText: 'Resumen',
      threadId: null,
      lastPostedAt: null
    },
    createdAt: Number.isFinite(overrides.createdAt) ? overrides.createdAt : now,
    expiresAt: Number.isFinite(overrides.expiresAt) ? overrides.expiresAt : now + 70 * 60 * 1000,
    closesAt: Number.isFinite(overrides.closesAt) ? overrides.closesAt : now + 60 * 60 * 1000,
    isClosed: Boolean(overrides.isClosed)
  };
}

module.exports = {
  buildWar,
  buildWarRole,
  buildParticipant
};
