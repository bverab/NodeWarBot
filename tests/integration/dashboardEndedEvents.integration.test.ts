import { describe, expect, it, vi } from "vitest";
import { setupIntegrationSuite } from "../helpers/dbTestHarness";
import { prisma } from "../../src/db/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/eventDateTime", async () => await vi.importActual("../../apps/dashboard/lib/eventDateTime"));
vi.mock("@/lib/server/apiErrors", async () => await vi.importActual("../../apps/dashboard/lib/server/apiErrors"));
vi.mock("@/lib/server/discordMembers", () => ({
  fetchDiscordGuildMembers: vi.fn(async () => new Map())
}));
vi.mock("@/lib/server/prisma", async () => {
  const { prisma } = await import("../../src/db/client");
  return { prisma };
});

setupIntegrationSuite();

// When the bot expires an event it deletes the Discord message and sets messageId = null and isClosed = true. That must not
// look like a never-published draft (it would show "draft" and be offered "Delete permanently"), while real drafts stay as is.
const GUILD_ID = "guild_ended_events";
const HOUR = 60 * 60 * 1000;
const future = (hours: number) => new Date(Date.now() + hours * HOUR);
const past = (hours: number) => new Date(Date.now() - hours * HOUR);

type SeedOptions = { messageId?: string | null; isClosed?: boolean; closesAt?: Date; expiresAt?: Date; lastMessageIdDeleted?: Date };

async function seed(id: string, options: SeedOptions = {}) {
  await prisma.guild.upsert({ where: { id: GUILD_ID }, update: {}, create: { id: GUILD_ID } });
  await prisma.event.create({
    data: {
      id,
      eventType: "war",
      accessMode: "OPEN",
      name: id,
      type: "Node War",
      guildId: GUILD_ID,
      messageId: options.messageId ?? null,
      isClosed: options.isClosed ?? false,
      createdAt: past(5),
      closesAt: options.closesAt ?? future(1),
      expiresAt: options.expiresAt ?? future(2),
      ...(options.lastMessageIdDeleted ? { schedule: { create: { enabled: false, mode: "once", lastMessageIdDeleted: options.lastMessageIdDeleted } } } : {})
    }
  });
}

const data = () => import("../../apps/dashboard/lib/server/dashboardData");

async function listed(id: string) {
  const { getGuildEvents } = await data();
  return (await getGuildEvents(GUILD_ID)).find((event) => event.id === id);
}

describe("status of events without a Discord message", () => {
  it("shows a bot-expired event (message deleted, closed, past its end) as closed and not deletable", async () => {
    await seed("bot_expired", { isClosed: true, closesAt: past(3), expiresAt: past(2), lastMessageIdDeleted: past(2) });

    expect(await listed("bot_expired")).toMatchObject({ status: "closed", published: false, canDelete: false });
  });

  it("shows the same in the event detail and in the overview", async () => {
    const { getGuildEventDetail, getGuildOverview } = await data();
    await seed("bot_expired_detail", { isClosed: true, closesAt: past(3), expiresAt: past(2) });

    expect(await getGuildEventDetail(GUILD_ID, "bot_expired_detail")).toMatchObject({ status: "closed", published: false, canDelete: false });
    const overview = await getGuildOverview(GUILD_ID);
    expect(overview.recentEvents.find((event) => event.id === "bot_expired_detail")).toMatchObject({ status: "closed", canDelete: false });
  });

  it("keeps real drafts exactly as before: draft and deletable", async () => {
    await seed("draft_future");
    await seed("draft_past_not_closed", { closesAt: past(3), expiresAt: past(2) });
    await seed("draft_closed_early", { isClosed: true, closesAt: future(1), expiresAt: future(2) });
    await seed("draft_unpublished_from_web");

    for (const id of ["draft_future", "draft_past_not_closed", "draft_closed_early", "draft_unpublished_from_web"]) {
      expect(await listed(id), id).toMatchObject({ status: "draft", published: false, canDelete: true });
    }
  });

  it("does not change how published events are classified", async () => {
    await seed("published_open", { messageId: "300000000000000001" });
    await seed("published_closed", { messageId: "300000000000000002", isClosed: true });
    await seed("published_expired", { messageId: "300000000000000003", closesAt: past(3), expiresAt: past(2) });

    expect(await listed("published_open")).toMatchObject({ status: "open", published: true, canDelete: false });
    expect(await listed("published_closed")).toMatchObject({ status: "closed", published: true, canDelete: false });
    expect(await listed("published_expired")).toMatchObject({ status: "expired", published: true, canDelete: false });
  });
});

describe("deleting an event as a draft", () => {
  it("still deletes a real draft", async () => {
    const { deleteGuildDraftEvent } = await data();
    await seed("delete_real_draft");

    expect(await deleteGuildDraftEvent(GUILD_ID, "delete_real_draft")).toEqual({ status: "deleted" });
    expect(await prisma.event.count({ where: { id: "delete_real_draft" } })).toBe(0);
  });

  it("refuses a bot-expired event on the server, keeping it and its roster", async () => {
    const { deleteGuildDraftEvent } = await data();
    await seed("delete_ended", { isClosed: true, closesAt: past(3), expiresAt: past(2) });
    await prisma.eventRoleSlot.create({ data: { id: "delete_ended_slot", eventId: "delete_ended", position: 0, name: "Flex", max: 5 } });
    await prisma.eventParticipant.create({ data: { eventId: "delete_ended", roleSlotId: "delete_ended_slot", userId: "u1", displayName: "U1" } });

    expect(await deleteGuildDraftEvent(GUILD_ID, "delete_ended")).toEqual({ status: "ended" });

    expect(await prisma.event.count({ where: { id: "delete_ended" } })).toBe(1);
    expect(await prisma.eventParticipant.count({ where: { eventId: "delete_ended" } })).toBe(1);
  });

  it("keeps refusing published events and unknown or foreign ones", async () => {
    const { deleteGuildDraftEvent } = await data();
    await seed("delete_published", { messageId: "300000000000000009" });

    expect(await deleteGuildDraftEvent(GUILD_ID, "delete_published")).toEqual({ status: "not_draft" });
    expect(await deleteGuildDraftEvent(GUILD_ID, "missing")).toEqual({ status: "not_found" });
    expect(await deleteGuildDraftEvent("another_guild", "delete_published")).toEqual({ status: "not_found" });
  });
});
