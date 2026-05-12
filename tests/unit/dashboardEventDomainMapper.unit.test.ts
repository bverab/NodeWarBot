import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("dashboard event publish domain mapper", () => {
  it("maps Prisma event shape into the existing Discord render domain", async () => {
    const { mapDbEventToDiscordDomain } = await import("../../apps/dashboard/lib/server/eventDomainMapper");
    const now = new Date("2026-05-05T12:00:00.000Z");
    const mapped = mapDbEventToDiscordDomain({
      id: "event_1",
      groupId: null,
      eventType: "war",
      accessMode: "OPEN",
      name: "Node War",
      type: "Balenos",
      classIconSource: "bot",
      participantDisplayStyle: "modern",
      creatorId: "creator_1",
      guildId: "guild_1",
      channelId: "channel_1",
      messageId: null,
      dayOfWeek: 2,
      time: "20:00",
      timezone: "UTC",
      duration: 70,
      closeBeforeMinutes: 10,
      createdAt: now,
      expiresAt: now,
      closesAt: now,
      isClosed: false,
      roleSlots: [
        {
          name: "Flex",
          max: 2,
          emoji: "o",
          emojiSource: "unicode",
          users: [{ userId: "user_1", displayName: "User One", isFake: false }],
          permissions: [{ discordRoleId: "role_1", discordRoleName: null }]
        }
      ],
      waitlist: [{ userId: "user_2", userName: "User Two", roleName: "Flex", joinedAt: now, isFake: false }],
      notifyTargets: [{ targetId: "notify_role_1" }],
      accessUsers: [{ userId: "allowed_user_1" }],
      accessRoles: [{ roleId: "access_role_1" }],
      fillers: [],
      schedule: { enabled: false, mode: "once", lastCreatedAt: null, lastMessageIdDeleted: null },
      recap: { enabled: false, minutesBeforeExpire: 0, messageText: "", threadId: null, lastPostedAt: null }
    });

    expect(mapped).toMatchObject({
      id: "event_1",
      channelId: "channel_1",
      messageId: null,
      notifyRoles: ["notify_role_1"],
      allowedUserIds: ["allowed_user_1"],
      allowedRoleIds: ["access_role_1"],
      roles: [
        {
          name: "Flex",
          users: [{ userId: "user_1", displayName: "User One", isFake: false }],
          allowedRoleIds: ["role_1"]
        }
      ],
      waitlist: [{ userId: "user_2", userName: "User Two", roleName: "Flex", joinedAt: now.getTime(), isFake: false }]
    });
  });
});
