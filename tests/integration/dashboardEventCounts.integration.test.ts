import { afterEach, describe, expect, it, vi } from "vitest";
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

const GUILD_ID = "guild_counts";
const OTHER_GUILD_ID = "guild_counts_other";
const FUTURE = new Date("2099-01-01T00:00:00.000Z");
const FUTURE_CLOSE = new Date("2098-12-31T00:00:00.000Z");
const PAST = new Date("2000-01-01T00:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
});

async function createEvent(id: string, overrides: Record<string, unknown> = {}) {
  await prisma.guild.upsert({ where: { id: GUILD_ID }, update: {}, create: { id: GUILD_ID } });
  await prisma.guild.upsert({ where: { id: OTHER_GUILD_ID }, update: {}, create: { id: OTHER_GUILD_ID } });
  return prisma.event.create({
    data: {
      id,
      eventType: "war",
      accessMode: "OPEN",
      name: id,
      type: "Node War",
      guildId: GUILD_ID,
      createdAt: new Date("2098-01-01T00:00:00.000Z"),
      closesAt: FUTURE_CLOSE,
      expiresAt: FUTURE,
      ...overrides
    }
  });
}

// War event with 2 signed-up participants, 3 on the waitlist and 1 filler.
async function seedWarEvent(id: string) {
  await createEvent(id, { messageId: `msg_${id}` });
  await prisma.eventRoleSlot.create({ data: { id: `${id}_slot`, eventId: id, position: 0, name: "Flex", max: 5 } });
  await prisma.eventParticipant.createMany({
    data: [
      { eventId: id, roleSlotId: `${id}_slot`, userId: "u1", displayName: "U1" },
      { eventId: id, roleSlotId: `${id}_slot`, userId: "u2", displayName: "U2" }
    ]
  });
  await prisma.eventWaitlistEntry.createMany({
    data: [1, 2, 3].map((position) => ({ eventId: id, position, userId: `w${position}`, userName: `W${position}` }))
  });
  await prisma.eventFillerEntry.create({ data: { eventId: id, userId: "f1", displayName: "F1" } });
}

// PvE event with 3 primary enrollments, 3 filler enrollments (one stored in lowercase) and 1 filler entry.
async function seedPveEvent(id: string, overrides: Record<string, unknown> = {}) {
  await createEvent(id, { eventType: "pve", ...overrides });
  await prisma.eventOption.create({ data: { id: `${id}_opt`, eventId: id, position: 0, label: "Run", time: "20:00", capacity: 10 } });
  const types = ["PRIMARY", "PRIMARY", "primary", "FILLER", "FILLER", "filler"];
  await prisma.eventEnrollment.createMany({
    data: types.map((enrollmentType, index) => ({
      eventId: id,
      optionId: `${id}_opt`,
      userId: `p${index}`,
      displayName: `P${index}`,
      enrollmentType
    }))
  });
  await prisma.eventFillerEntry.create({ data: { eventId: id, userId: "f1", displayName: "F1" } });
}

function requestedRelations(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.flatMap(([args]) => {
    const include = (args as { include?: Record<string, unknown> } | undefined)?.include ?? {};
    return ["participants", "enrollments", "waitlist", "fillers"].filter((name) => include[name] === true);
  });
}

describe("dashboard event counts", () => {
  it("lists events with the same counts as the loaded relations would give", async () => {
    const { getGuildEvents } = await import("../../apps/dashboard/lib/server/dashboardData");
    await seedWarEvent("count_war_1");
    await seedPveEvent("count_pve_1");
    await createEvent("count_empty_1");
    await createEvent("count_other_guild", { guildId: OTHER_GUILD_ID });

    const events = await getGuildEvents(GUILD_ID);
    const byId = new Map(events.map((event) => [event.id, event]));

    expect(events).toHaveLength(3);
    expect(byId.get("count_war_1")).toMatchObject({ participantCount: 2, waitlistCount: 3, fillerCount: 1 });
    expect(byId.get("count_pve_1")).toMatchObject({ participantCount: 3, waitlistCount: 0, fillerCount: 4 });
    expect(byId.get("count_empty_1")).toMatchObject({ participantCount: 0, waitlistCount: 0, fillerCount: 0 });
  });

  it("keeps schedule information on the list items", async () => {
    const { getGuildEvents } = await import("../../apps/dashboard/lib/server/dashboardData");
    await createEvent("count_recurring_1", { groupId: "group_1", messageId: "msg_recurring_1" });
    await prisma.eventSchedule.create({ data: { eventId: "count_recurring_1", enabled: true, mode: "recurring" } });

    const [event] = await getGuildEvents(GUILD_ID);

    expect(event).toMatchObject({ id: "count_recurring_1", recurrenceMode: "recurring", isRecurring: true, status: "open", published: true });
  });

  it("filters by event type with the same counts", async () => {
    const { getGuildEventsByType, getGuildEventsByTypes } = await import("../../apps/dashboard/lib/server/dashboardData");
    await seedWarEvent("count_war_2");
    await seedPveEvent("count_pve_2");

    const pve = await getGuildEventsByType(GUILD_ID, "pve");
    const both = await getGuildEventsByTypes(GUILD_ID, ["war", "pve"]);
    const warOnly = await getGuildEventsByTypes(GUILD_ID, ["war"]);

    expect(pve.map((event) => event.id)).toEqual(["count_pve_2"]);
    expect(pve[0]).toMatchObject({ participantCount: 3, fillerCount: 4 });
    expect(both).toHaveLength(2);
    expect(warOnly.map((event) => event.id)).toEqual(["count_war_2"]);
    expect(warOnly[0]).toMatchObject({ participantCount: 2, waitlistCount: 3, fillerCount: 1 });
  });

  it("computes the overview with the same numbers", async () => {
    const { getGuildOverview } = await import("../../apps/dashboard/lib/server/dashboardData");
    await seedWarEvent("count_war_3");
    await seedPveEvent("count_pve_3", { isClosed: true });
    await createEvent("count_past_3", { closesAt: PAST, expiresAt: PAST });
    await createEvent("count_other_guild_3", { guildId: OTHER_GUILD_ID });
    await prisma.eventTemplate.create({ data: { id: "tpl_counts", guildId: GUILD_ID, name: "T" } });

    const overview = await getGuildOverview(GUILD_ID);

    expect(overview).toMatchObject({
      totalEvents: 3,
      activeEvents: 1,
      upcomingEvents: 2,
      // 2 war participants + 6 PvE enrollments (fillers included, as before)
      totalParticipants: 8,
      scheduledEvents: 0,
      templates: 1,
      garmothProfiles: 0
    });
    const recent = new Map(overview.recentEvents.map((event) => [event.id, event]));
    expect(recent.get("count_war_3")).toMatchObject({ participantCount: 2, waitlistCount: 3, fillerCount: 1 });
    expect(recent.get("count_pve_3")).toMatchObject({ participantCount: 3, fillerCount: 4, status: "draft" });
  });

  describe("ordering", () => {
    async function seedOrdered() {
      // Open events: closing soonest first. Closed events: most recently closing first.
      await createEvent("order_open_b", { closesAt: new Date("2098-02-02T00:00:00.000Z") });
      await createEvent("order_open_a", { closesAt: new Date("2098-01-01T00:00:00.000Z") });
      await createEvent("order_open_c", { closesAt: new Date("2098-03-03T00:00:00.000Z") });
      await createEvent("order_closed_old", { isClosed: true, closesAt: new Date("2090-01-01T00:00:00.000Z") });
      await createEvent("order_closed_new", { isClosed: true, closesAt: new Date("2097-01-01T00:00:00.000Z") });
      await createEvent("order_closed_mid", { isClosed: true, closesAt: new Date("2095-01-01T00:00:00.000Z") });
    }

    it("lists open events by closing time ascending, then closed events newest first", async () => {
      const { getGuildEvents, getGuildEventsByType } = await import("../../apps/dashboard/lib/server/dashboardData");
      await seedOrdered();

      const expected = ["order_open_a", "order_open_b", "order_open_c", "order_closed_new", "order_closed_mid", "order_closed_old"];
      expect((await getGuildEvents(GUILD_ID)).map((event) => event.id)).toEqual(expected);
      expect((await getGuildEventsByType(GUILD_ID, "war")).map((event) => event.id)).toEqual(expected);
    });

    it("orders the recent events of the overview the same way", async () => {
      const { getGuildOverview } = await import("../../apps/dashboard/lib/server/dashboardData");
      await seedOrdered();

      const overview = await getGuildOverview(GUILD_ID);

      expect(overview.recentEvents.map((event) => event.id)).toEqual([
        "order_open_a",
        "order_open_b",
        "order_open_c",
        "order_closed_new",
        "order_closed_mid",
        "order_closed_old"
      ]);
    });

    it("keeps the 100 event limit and fills what is left after the open events with the newest closed ones", async () => {
      const { getGuildEvents } = await import("../../apps/dashboard/lib/server/dashboardData");
      await prisma.guild.upsert({ where: { id: GUILD_ID }, update: {}, create: { id: GUILD_ID } });
      const day = 24 * 60 * 60 * 1000;
      const base = new Date("2098-01-01T00:00:00.000Z").getTime();
      await prisma.event.createMany({
        data: Array.from({ length: 98 }, (_, index) => ({
          id: `limit_open_${String(index).padStart(3, "0")}`,
          eventType: "war",
          name: `open ${index}`,
          type: "Node War",
          guildId: GUILD_ID,
          createdAt: new Date(base),
          closesAt: new Date(base + index * day),
          expiresAt: new Date(base + 200 * day)
        }))
      });
      await prisma.event.createMany({
        data: Array.from({ length: 5 }, (_, index) => ({
          id: `limit_closed_${index}`,
          eventType: "war",
          name: `closed ${index}`,
          type: "Node War",
          guildId: GUILD_ID,
          isClosed: true,
          createdAt: new Date(base),
          closesAt: new Date(base - (index + 1) * day),
          expiresAt: new Date(base)
        }))
      });

      const events = await getGuildEvents(GUILD_ID);

      expect(events).toHaveLength(100);
      expect(events[0].id).toBe("limit_open_000");
      expect(events[97].id).toBe("limit_open_097");
      expect(events.slice(98).map((event) => event.id)).toEqual(["limit_closed_0", "limit_closed_1"]);
    });
  });

  it("does not load whole relations just to count them", async () => {
    const { getGuildEvents, getGuildEventsByType, getGuildEventsByTypes, getGuildOverview } = await import("../../apps/dashboard/lib/server/dashboardData");
    await seedWarEvent("count_war_4");
    await seedPveEvent("count_pve_4");
    const spy = vi.spyOn(prisma.event, "findMany");

    await getGuildEvents(GUILD_ID);
    await getGuildEventsByType(GUILD_ID, "war");
    await getGuildEventsByTypes(GUILD_ID, ["war", "pve"]);
    await getGuildOverview(GUILD_ID);

    expect(spy).toHaveBeenCalled();
    expect(requestedRelations(spy)).toEqual([]);
    for (const [args] of spy.mock.calls) {
      const select = (args as { select?: Record<string, unknown> } | undefined)?.select ?? {};
      for (const name of ["participants", "enrollments"]) {
        expect(select[name], `select.${name}`).not.toMatchObject({ select: { id: true } });
      }
    }
  });
});
