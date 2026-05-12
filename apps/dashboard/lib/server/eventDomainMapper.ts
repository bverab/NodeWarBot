import "server-only";

type DbEventForDiscord = {
  id: string;
  groupId: string | null;
  eventType: string;
  accessMode: string;
  name: string;
  type: string;
  classIconSource: string;
  participantDisplayStyle: string;
  creatorId: string | null;
  guildId: string | null;
  channelId: string | null;
  messageId: string | null;
  dayOfWeek: number | null;
  time: string | null;
  timezone: string;
  duration: number;
  closeBeforeMinutes: number;
  createdAt: Date;
  expiresAt: Date;
  closesAt: Date;
  isClosed: boolean;
  roleSlots: Array<{
    name: string;
    max: number;
    emoji: string | null;
    emojiSource: string | null;
    users: Array<{
      userId: string;
      displayName: string;
      isFake: boolean;
    }>;
    permissions: Array<{
      discordRoleId: string | null;
      discordRoleName: string | null;
    }>;
  }>;
  waitlist: Array<{
    userId: string;
    userName: string;
    roleName: string | null;
    joinedAt: Date;
    isFake: boolean;
  }>;
  notifyTargets: Array<{ targetId: string }>;
  accessUsers: Array<{ userId: string }>;
  accessRoles: Array<{ roleId: string }>;
  fillers: Array<{
    userId: string;
    displayName: string;
    isFake: boolean;
    joinedAt: Date;
  }>;
  schedule: {
    enabled: boolean;
    mode: string;
    lastCreatedAt: Date | null;
    lastMessageIdDeleted: Date | null;
  } | null;
  recap: {
    enabled: boolean;
    minutesBeforeExpire: number;
    messageText: string;
    threadId: string | null;
    lastPostedAt: Date | null;
  } | null;
};

function toNumber(date: Date | null | undefined) {
  return date ? date.getTime() : null;
}

export function mapDbEventToDiscordDomain(event: DbEventForDiscord) {
  return {
    id: event.id,
    groupId: event.groupId,
    eventType: event.eventType,
    accessMode: event.accessMode,
    name: event.name,
    type: event.type,
    classIconSource: event.classIconSource,
    participantDisplayStyle: event.participantDisplayStyle,
    creatorId: event.creatorId,
    guildId: event.guildId,
    channelId: event.channelId,
    messageId: event.messageId,
    dayOfWeek: event.dayOfWeek,
    time: event.time,
    timezone: event.timezone,
    duration: event.duration,
    closeBeforeMinutes: event.closeBeforeMinutes,
    createdAt: event.createdAt.getTime(),
    expiresAt: event.expiresAt.getTime(),
    closesAt: event.closesAt.getTime(),
    isClosed: event.isClosed,
    roles: event.roleSlots.map((slot) => ({
      name: slot.name,
      max: slot.max,
      emoji: slot.emoji,
      emojiSource: slot.emojiSource,
      users: slot.users.map((user) => ({
        userId: user.userId,
        displayName: user.displayName,
        isFake: user.isFake
      })),
      allowedRoleIds: slot.permissions.map((permission) => permission.discordRoleId).filter(Boolean),
      allowedRoles: slot.permissions.map((permission) => permission.discordRoleName).filter(Boolean)
    })),
    waitlist: event.waitlist.map((entry) => ({
      userId: entry.userId,
      userName: entry.userName,
      roleName: entry.roleName,
      joinedAt: entry.joinedAt.getTime(),
      isFake: entry.isFake
    })),
    notifyRoles: event.notifyTargets.map((target) => target.targetId),
    allowedUserIds: event.accessUsers.map((user) => user.userId),
    allowedRoleIds: event.accessRoles.map((role) => role.roleId),
    fillers: event.fillers.map((entry) => ({
      userId: entry.userId,
      displayName: entry.displayName,
      isFake: entry.isFake,
      joinedAt: entry.joinedAt.getTime()
    })),
    schedule: {
      enabled: Boolean(event.schedule?.enabled),
      mode: event.schedule?.mode === "recurring" ? "recurring" : "once",
      lastCreatedAt: toNumber(event.schedule?.lastCreatedAt),
      lastMessageIdDeleted: toNumber(event.schedule?.lastMessageIdDeleted)
    },
    recap: {
      enabled: Boolean(event.recap?.enabled),
      minutesBeforeExpire: Number.isFinite(event.recap?.minutesBeforeExpire) ? event.recap?.minutesBeforeExpire ?? 0 : 0,
      messageText: String(event.recap?.messageText || ""),
      threadId: event.recap?.threadId ?? null,
      lastPostedAt: toNumber(event.recap?.lastPostedAt)
    }
  };
}
