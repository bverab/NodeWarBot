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
