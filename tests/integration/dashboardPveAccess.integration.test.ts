import { describe, expect, it, vi } from "vitest";
import { setupIntegrationSuite } from "../helpers/dbTestHarness";
import { prisma } from "../../src/db/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/eventDateTime", async () => await vi.importActual("../../apps/dashboard/lib/eventDateTime"));
vi.mock("@/lib/server/discordMembers", () => ({
  fetchDiscordGuildMembers: vi.fn(async () => new Map())
}));
vi.mock("@/lib/server/prisma", async () => {
  const { prisma } = await import("../../src/db/client");
  return { prisma };
});

setupIntegrationSuite();

const GUILD_ID = "guild_pve_access";
const ROLE_ID = "300000000000000003";
const USER_A = "400000000000000004";
const USER_B = "400000000000000005";

const pveInput = {
  name: "Boss night",
  eventType: "pve",
  type: "Evento PvE",
  date: "2026-05-05",
  time: "20:00",
  timezone: "America/Santiago",
  duration: 60,
  closeBeforeMinutes: 0,
  channelId: "200000000000000002",
  autoPublishEnabled: false,
  pveOptions: [{ label: "20:00", time: "20:00", capacity: 2, position: 0 }]
};

async function loadAccess(eventId: string) {
  return prisma.event.findUnique({
    where: { id: eventId },
    include: { accessRoles: { orderBy: { position: "asc" } }, accessUsers: { orderBy: { position: "asc" } } }
  });
}

describe("dashboard PvE access", () => {
  it("a PvE draft stores its access mode with the people or roles that have access", async () => {
    const { createGuildEventDraft } = await import("../../apps/dashboard/lib/server/dashboardData");

    const byPeople = await createGuildEventDraft(GUILD_ID, "creator_1", { ...pveInput, accessMode: "USERS", accessUserIds: [USER_A, USER_B] });
    const byRoles = await createGuildEventDraft(GUILD_ID, "creator_1", { ...pveInput, accessMode: "ROLES", accessRoleIds: [ROLE_ID] });
    const open = await createGuildEventDraft(GUILD_ID, "creator_1", { ...pveInput });

    const people = await loadAccess(byPeople.id);
    expect(people?.accessMode).toBe("USERS");
    expect(people?.accessUsers.map((entry) => entry.userId)).toEqual([USER_A, USER_B]);
    const roles = await loadAccess(byRoles.id);
    expect(roles?.accessMode).toBe("ROLES");
    expect(roles?.accessRoles.map((entry) => entry.roleId)).toEqual([ROLE_ID]);
    expect((await loadAccess(open.id))?.accessMode).toBe("OPEN");
  });

  it("editing the access replaces both lists, sets the mode and moves qualifying fillers up while there is room", async () => {
    const { createGuildEventDraft, updatePveEventAccess, getGuildEventDetail } = await import("../../apps/dashboard/lib/server/dashboardData");
    const draft = await createGuildEventDraft(GUILD_ID, "creator_1", { ...pveInput, accessMode: "USERS", accessUserIds: [USER_A] });
    const option = await prisma.eventOption.findFirstOrThrow({ where: { eventId: draft.id } });
    for (const [userId, enrollmentType] of [[USER_A, "PRIMARY"], ["filler_1", "FILLER"], ["filler_2", "FILLER"]]) {
      await prisma.eventEnrollment.create({ data: { eventId: draft.id, optionId: option.id, userId, displayName: userId, enrollmentType } });
    }

    const resolveMemberRoleIds = vi.fn(async (userId: string) => (userId === "filler_2" ? [ROLE_ID] : []));
    const result = await updatePveEventAccess(GUILD_ID, draft.id, { accessMode: "ROLES", roleIds: [ROLE_ID], userIds: [USER_A, USER_B] }, { resolveMemberRoleIds });

    expect(result?.promoted.map((entry) => entry.userId)).toEqual(["filler_2"]);
    const stored = await loadAccess(draft.id);
    expect(stored?.accessMode).toBe("ROLES");
    expect(stored?.accessRoles.map((entry) => entry.roleId)).toEqual([ROLE_ID]);
    expect(stored?.accessUsers.map((entry) => entry.userId)).toEqual([USER_A, USER_B]);
    const enrollments = await prisma.eventEnrollment.findMany({ where: { eventId: draft.id }, orderBy: { userId: "asc" } });
    expect(enrollments.map((entry) => [entry.userId, entry.enrollmentType])).toEqual([
      [USER_A, "PRIMARY"],
      ["filler_1", "FILLER"],
      ["filler_2", "PRIMARY"]
    ]);

    const detail = await getGuildEventDetail(GUILD_ID, draft.id);
    expect(detail?.access).toEqual({
      mode: "ROLES",
      roleIds: [ROLE_ID],
      users: [
        { userId: USER_A, displayName: USER_A, avatarUrl: null },
        { userId: USER_B, displayName: USER_B, avatarUrl: null }
      ]
    });
  });

  it("archiving a published PvE event records it, so its close cannot promote fillers or open a vote", async () => {
    const { archiveGuildEvent, createGuildEventDraft } = await import("../../apps/dashboard/lib/server/dashboardData");
    const open = await createGuildEventDraft(GUILD_ID, "creator_1", { ...pveInput });
    await prisma.event.update({ where: { id: open.id }, data: { messageId: "archive_open_msg" } });
    const closed = await createGuildEventDraft(GUILD_ID, "creator_1", { ...pveInput });
    await prisma.event.update({ where: { id: closed.id }, data: { messageId: "archive_closed_msg", isClosed: true } });
    const draft = await createGuildEventDraft(GUILD_ID, "creator_1", { ...pveInput });

    await archiveGuildEvent(GUILD_ID, open.id);
    await archiveGuildEvent(GUILD_ID, closed.id);
    await archiveGuildEvent(GUILD_ID, draft.id);

    await expect(prisma.eventPveCloseReview.findUnique({ where: { eventId: open.id } })).resolves.toMatchObject({ status: "cancelled", messageId: "archive_open_msg" });
    await expect(prisma.eventPveCloseReview.findUnique({ where: { eventId: closed.id } })).resolves.toMatchObject({ status: "cancelled", messageId: "archive_closed_msg" });
    await expect(prisma.eventPveCloseReview.findUnique({ where: { eventId: draft.id } })).resolves.toBeNull();
  });

  it("archives the event and records it in one transaction, so the bot never sees one without the other", async () => {
    const { archiveGuildEvent, createGuildEventDraft } = await import("../../apps/dashboard/lib/server/dashboardData");
    const open = await createGuildEventDraft(GUILD_ID, "creator_1", { ...pveInput });
    await prisma.event.update({ where: { id: open.id }, data: { messageId: "archive_atomic_msg" } });
    const transaction = vi.spyOn(prisma, "$transaction");

    await archiveGuildEvent(GUILD_ID, open.id);

    expect(transaction).toHaveBeenCalledTimes(1);
    transaction.mockRestore();
    await expect(prisma.event.findUnique({ where: { id: open.id } })).resolves.toMatchObject({ isClosed: true });
  });

  it("refuses to set an access mode on a War event and returns null for another guild", async () => {
    const { createGuildEventDraft, updatePveEventAccess } = await import("../../apps/dashboard/lib/server/dashboardData");
    const war = await createGuildEventDraft(GUILD_ID, "creator_1", {
      ...pveInput,
      eventType: "war",
      pveOptions: undefined,
      slots: [{ name: "Flex", max: 5, position: 0, emoji: null, emojiSource: null, allowedRoleIds: [] }]
    });

    await expect(updatePveEventAccess(GUILD_ID, war.id, { accessMode: "OPEN", roleIds: [], userIds: [] })).rejects.toMatchObject({ name: "InputError" });
    await expect(updatePveEventAccess("other_guild", war.id, { accessMode: "OPEN", roleIds: [], userIds: [] })).resolves.toBeNull();
  });
});
