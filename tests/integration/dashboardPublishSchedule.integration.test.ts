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

// The bot's weekly recurrence skips an event whose schedule.lastCreatedAt is today. Anything published from the web has
// to record that time too, or the bot may delete a same-day web publication to publish its own.
const GUILD_ID = "guild_publish_schedule";
const CHANNEL_ID = "200000000000000002";
const PUBLISHED_AT = new Date("2030-05-05T20:00:00.000Z");
const STALE = new Date("2020-01-01T00:00:00.000Z");

async function seedDraft(id: string, schedule?: { enabled: boolean; mode: string; lastCreatedAt?: Date | null }, extra: Record<string, unknown> = {}) {
  await prisma.guild.upsert({ where: { id: GUILD_ID }, update: {}, create: { id: GUILD_ID } });
  await prisma.event.create({
    data: {
      id,
      eventType: "war",
      accessMode: "OPEN",
      name: id,
      type: "Node War",
      guildId: GUILD_ID,
      createdAt: new Date("2099-01-01T00:00:00.000Z"),
      closesAt: new Date("2099-01-02T00:00:00.000Z"),
      expiresAt: new Date("2099-01-03T00:00:00.000Z"),
      updatedAt: STALE,
      ...(schedule ? { schedule: { create: schedule } } : {}),
      ...extra
    }
  });
}

const data = () => import("../../apps/dashboard/lib/server/dashboardData");
const scheduleOf = (eventId: string) => prisma.eventSchedule.findUnique({ where: { eventId } });

describe("markEventPublished", () => {
  it("stores the message and the publish time in schedule.lastCreatedAt, and bumps updatedAt", async () => {
    const { markEventPublished } = await data();
    await seedDraft("pub_once", { enabled: false, mode: "once" });

    const published = await markEventPublished(GUILD_ID, "pub_once", { channelId: CHANNEL_ID, messageId: "300000000000000003", publishedAt: PUBLISHED_AT });

    expect(published).toBe(true);
    expect(await prisma.event.findUnique({ where: { id: "pub_once" } })).toMatchObject({ channelId: CHANNEL_ID, messageId: "300000000000000003" });
    expect(await scheduleOf("pub_once")).toMatchObject({ enabled: false, mode: "once", lastCreatedAt: PUBLISHED_AT });
    const event = await prisma.event.findUniqueOrThrow({ where: { id: "pub_once" }, select: { updatedAt: true } });
    expect(event.updatedAt.getTime()).toBeGreaterThan(STALE.getTime());
  });

  it("keeps a recurring schedule enabled and only moves lastCreatedAt", async () => {
    const { markEventPublished } = await data();
    await seedDraft("pub_recurring", { enabled: true, mode: "recurring", lastCreatedAt: new Date("2030-04-28T20:00:00.000Z") });

    await markEventPublished(GUILD_ID, "pub_recurring", { channelId: CHANNEL_ID, messageId: "300000000000000004", publishedAt: PUBLISHED_AT });

    expect(await scheduleOf("pub_recurring")).toMatchObject({ enabled: true, mode: "recurring", lastCreatedAt: PUBLISHED_AT });
  });

  it("creates the schedule row when the event has none (as the bot reads a missing one: disabled, once)", async () => {
    const { markEventPublished } = await data();
    await seedDraft("pub_no_schedule");
    expect(await scheduleOf("pub_no_schedule")).toBeNull();

    const published = await markEventPublished(GUILD_ID, "pub_no_schedule", { channelId: CHANNEL_ID, messageId: "300000000000000005", publishedAt: PUBLISHED_AT });

    expect(published).toBe(true);
    expect(await scheduleOf("pub_no_schedule")).toMatchObject({ enabled: false, mode: "once", lastCreatedAt: PUBLISHED_AT });
  });

  it("defaults the publish time to now", async () => {
    const { markEventPublished } = await data();
    await seedDraft("pub_now", { enabled: false, mode: "once" });
    const before = Date.now();

    await markEventPublished(GUILD_ID, "pub_now", { channelId: CHANNEL_ID, messageId: "300000000000000006" });

    const schedule = await scheduleOf("pub_now");
    expect(schedule?.lastCreatedAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(schedule?.lastCreatedAt?.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("refuses an event that is already published, leaving everything as it was", async () => {
    const { markEventPublished } = await data();
    const earlier = new Date("2030-05-01T10:00:00.000Z");
    await seedDraft("pub_taken", { enabled: false, mode: "once", lastCreatedAt: earlier }, { messageId: "300000000000000007", channelId: CHANNEL_ID });

    const published = await markEventPublished(GUILD_ID, "pub_taken", { channelId: CHANNEL_ID, messageId: "300000000000000008", publishedAt: PUBLISHED_AT });

    expect(published).toBe(false);
    expect(await prisma.event.findUnique({ where: { id: "pub_taken" } })).toMatchObject({ messageId: "300000000000000007" });
    expect(await scheduleOf("pub_taken")).toMatchObject({ lastCreatedAt: earlier });
  });

  it("does not publish an event of another guild", async () => {
    const { markEventPublished } = await data();
    await seedDraft("pub_foreign", { enabled: false, mode: "once" });

    const published = await markEventPublished("another_guild", "pub_foreign", { channelId: CHANNEL_ID, messageId: "300000000000000009", publishedAt: PUBLISHED_AT });

    expect(published).toBe(false);
    expect(await prisma.event.findUnique({ where: { id: "pub_foreign" } })).toMatchObject({ messageId: null });
    expect(await scheduleOf("pub_foreign")).toMatchObject({ lastCreatedAt: null });
  });
});

describe("linking an existing Discord message to a draft (PATCH messageId)", () => {
  it("also records lastCreatedAt, since the event is published from then on", async () => {
    const { updateGuildEvent } = await data();
    await seedDraft("link_message", { enabled: true, mode: "recurring" });
    const before = Date.now();

    await updateGuildEvent(GUILD_ID, "link_message", { channelId: CHANNEL_ID, messageId: "300000000000000010" });

    const schedule = await scheduleOf("link_message");
    expect(schedule).toMatchObject({ enabled: true, mode: "recurring" });
    expect(schedule?.lastCreatedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("creates the schedule row for an event without one", async () => {
    const { updateGuildEvent } = await data();
    await seedDraft("link_no_schedule");

    await updateGuildEvent(GUILD_ID, "link_no_schedule", { messageId: "300000000000000011" });

    expect(await scheduleOf("link_no_schedule")).toMatchObject({ enabled: false, mode: "once" });
    expect((await scheduleOf("link_no_schedule"))?.lastCreatedAt).not.toBeNull();
  });

  it("leaves the schedule alone for edits that do not set a message", async () => {
    const { updateGuildEvent } = await data();
    await seedDraft("edit_only", { enabled: true, mode: "recurring" });
    await seedDraft("edit_clear", { enabled: true, mode: "recurring" });

    await updateGuildEvent(GUILD_ID, "edit_only", { name: "Renamed", isClosed: true });
    await updateGuildEvent(GUILD_ID, "edit_clear", { messageId: null });

    expect(await scheduleOf("edit_only")).toMatchObject({ lastCreatedAt: null });
    expect(await scheduleOf("edit_clear")).toMatchObject({ lastCreatedAt: null });
  });
});
