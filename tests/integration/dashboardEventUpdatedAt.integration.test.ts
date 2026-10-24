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

// The bot syncs its cache by comparing Event.updatedAt, and Prisma only bumps it when the Event row itself is written.
// Every dashboard write that only touches child rows (slots, slot permissions...) must therefore bump the parent.
const GUILD_ID = "guild_event_updated_at";
const STALE = new Date("2020-01-01T00:00:00.000Z");

async function seedEvent(id: string, options: { groupId?: string; recurring?: boolean } = {}) {
  await prisma.guild.upsert({ where: { id: GUILD_ID }, update: {}, create: { id: GUILD_ID } });
  await prisma.event.create({
    data: {
      id,
      groupId: options.groupId ?? null,
      eventType: "war",
      accessMode: "OPEN",
      name: id,
      type: "Node War",
      guildId: GUILD_ID,
      createdAt: new Date("2099-01-01T00:00:00.000Z"),
      closesAt: new Date("2099-01-02T00:00:00.000Z"),
      expiresAt: new Date("2099-01-03T00:00:00.000Z"),
      schedule: { create: { enabled: Boolean(options.recurring), mode: options.recurring ? "recurring" : "once" } },
      roleSlots: {
        create: [
          { id: `${id}_slot_a`, position: 0, name: "Flex", max: 5 },
          { id: `${id}_slot_b`, position: 1, name: "Tank", max: 2 }
        ]
      }
    }
  });
  await makeStale(id);
}

// Puts updatedAt far in the past, so any later bump is unambiguous (no same-millisecond ties).
async function makeStale(...eventIds: string[]) {
  await prisma.event.updateMany({ where: { id: { in: eventIds } }, data: { updatedAt: STALE } });
}

async function updatedAtOf(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { updatedAt: true } });
  return event.updatedAt;
}

async function expectBumped(...eventIds: string[]) {
  for (const eventId of eventIds) {
    expect((await updatedAtOf(eventId)).getTime(), `${eventId} updatedAt`).toBeGreaterThan(STALE.getTime());
  }
}

async function expectUntouched(...eventIds: string[]) {
  for (const eventId of eventIds) {
    expect((await updatedAtOf(eventId)).getTime(), `${eventId} updatedAt`).toBe(STALE.getTime());
  }
}

const data = () => import("../../apps/dashboard/lib/server/dashboardData");

describe("dashboard writes that only touch event child rows bump Event.updatedAt", () => {
  it("creating a slot", async () => {
    const { createGuildEventRoleSlot } = await data();
    await seedEvent("ua_create");

    const event = await createGuildEventRoleSlot(GUILD_ID, "ua_create", { name: "Healer", max: 3 });

    expect(event?.roleSlots.map((slot) => slot.name)).toContain("Healer");
    await expectBumped("ua_create");
  });

  it("renaming or resizing a slot", async () => {
    const { updateGuildEventRoleSlot } = await data();
    await seedEvent("ua_update");

    await updateGuildEventRoleSlot(GUILD_ID, "ua_update", "ua_update_slot_a", { name: "Flex renamed", max: 9 });

    expect(await prisma.eventRoleSlot.findUnique({ where: { id: "ua_update_slot_a" } })).toMatchObject({ name: "Flex renamed", max: 9 });
    await expectBumped("ua_update");
  });

  it("changing only the allowed roles of a slot (permission rows)", async () => {
    const { updateGuildEventRoleSlot } = await data();
    await seedEvent("ua_perm");

    await updateGuildEventRoleSlot(GUILD_ID, "ua_perm", "ua_perm_slot_a", { allowedRoleIds: ["11111", "22222"] });
    expect(await prisma.eventRolePermission.count({ where: { roleSlotId: "ua_perm_slot_a" } })).toBe(2);
    await expectBumped("ua_perm");

    await makeStale("ua_perm");
    await updateGuildEventRoleSlot(GUILD_ID, "ua_perm", "ua_perm_slot_a", { allowedRoleIds: [] });
    expect(await prisma.eventRolePermission.count({ where: { roleSlotId: "ua_perm_slot_a" } })).toBe(0);
    await expectBumped("ua_perm");
  });

  it("deleting a slot", async () => {
    const { deleteGuildEventRoleSlot } = await data();
    await seedEvent("ua_delete");

    await deleteGuildEventRoleSlot(GUILD_ID, "ua_delete", "ua_delete_slot_b");

    expect(await prisma.eventRoleSlot.findUnique({ where: { id: "ua_delete_slot_b" } })).toBeNull();
    await expectBumped("ua_delete");
  });

  it("does not touch the event when a slot with participants cannot be deleted", async () => {
    const { deleteGuildEventRoleSlot } = await data();
    await seedEvent("ua_blocked");
    await prisma.eventParticipant.create({ data: { eventId: "ua_blocked", roleSlotId: "ua_blocked_slot_a", userId: "u1", displayName: "U1" } });
    await makeStale("ua_blocked");

    const result = await deleteGuildEventRoleSlot(GUILD_ID, "ua_blocked", "ua_blocked_slot_a");

    expect(result).toMatchObject({ blocked: expect.any(String) });
    expect(await prisma.eventRoleSlot.findUnique({ where: { id: "ua_blocked_slot_a" } })).not.toBeNull();
    await expectUntouched("ua_blocked");
  });

  it("reordering slots", async () => {
    const { reorderGuildEventRoleSlots } = await data();
    await seedEvent("ua_reorder");

    await reorderGuildEventRoleSlots(GUILD_ID, "ua_reorder", [
      { id: "ua_reorder_slot_a", order: 2 },
      { id: "ua_reorder_slot_b", order: 1 }
    ]);

    expect(await prisma.eventRoleSlot.findUnique({ where: { id: "ua_reorder_slot_a" } })).toMatchObject({ position: 2 });
    await expectBumped("ua_reorder");
  });

  it("editing a slot for the whole series bumps every occurrence that was edited, and only those", async () => {
    const { updateGuildEventRoleSlotSeries } = await data();
    await seedEvent("ua_series_1", { groupId: "ua_series", recurring: true });
    await seedEvent("ua_series_2", { groupId: "ua_series", recurring: true });
    await seedEvent("ua_series_3", { groupId: "ua_series", recurring: true });
    await seedEvent("ua_other_series", { groupId: "ua_other", recurring: true });
    await seedEvent("ua_standalone");

    await updateGuildEventRoleSlotSeries(GUILD_ID, "ua_series_1", "ua_series_1_slot_a", { name: "Flex everywhere", allowedRoleIds: ["33333"] });

    expect(await prisma.eventRoleSlot.count({ where: { name: "Flex everywhere" } })).toBe(3);
    await expectBumped("ua_series_1", "ua_series_2", "ua_series_3");
    await expectUntouched("ua_other_series", "ua_standalone");
  });

  it("editing a slot of a non-recurring event 'for the series' behaves like a single edit", async () => {
    const { updateGuildEventRoleSlotSeries } = await data();
    await seedEvent("ua_single_series");

    await updateGuildEventRoleSlotSeries(GUILD_ID, "ua_single_series", "ua_single_series_slot_a", { max: 7 });

    await expectBumped("ua_single_series");
  });

  it("does not touch any event when the slot does not belong to it", async () => {
    const { updateGuildEventRoleSlot, deleteGuildEventRoleSlot, reorderGuildEventRoleSlots } = await data();
    await seedEvent("ua_foreign");
    await seedEvent("ua_foreign_other");

    expect(await updateGuildEventRoleSlot(GUILD_ID, "ua_foreign", "ua_foreign_other_slot_a", { name: "Hijack" })).toBeNull();
    expect(await deleteGuildEventRoleSlot(GUILD_ID, "ua_foreign", "ua_foreign_other_slot_a")).toBeNull();
    expect(await reorderGuildEventRoleSlots(GUILD_ID, "ua_foreign", [{ id: "ua_foreign_other_slot_a", order: 1 }])).toBeNull();

    await expectUntouched("ua_foreign", "ua_foreign_other");
  });

  it("rolls the bump back together with the write when the transaction fails", async () => {
    const { updateGuildEventRoleSlot } = await data();
    await seedEvent("ua_rollback");

    // Renaming slot A to the name of slot B violates @@unique([eventId, name]).
    await expect(updateGuildEventRoleSlot(GUILD_ID, "ua_rollback", "ua_rollback_slot_a", { name: "Tank" })).rejects.toBeTruthy();

    expect(await prisma.eventRoleSlot.findUnique({ where: { id: "ua_rollback_slot_a" } })).toMatchObject({ name: "Flex" });
    await expectUntouched("ua_rollback");
  });

  it("keeps bumping on writes to the Event row itself, and leaves events alone when only a template changes", async () => {
    const { setGuildEventClosed, updateGuildTemplateRoleSlot } = await data();
    await seedEvent("ua_row");
    await seedEvent("ua_template_bystander");
    await prisma.eventTemplate.create({
      data: { id: "ua_tpl", guildId: GUILD_ID, name: "T", roleSlots: { create: [{ id: "ua_tpl_slot", position: 0, name: "Flex", max: 1 }] } }
    });

    await setGuildEventClosed(GUILD_ID, "ua_row", true);
    await updateGuildTemplateRoleSlot(GUILD_ID, "ua_tpl", "ua_tpl_slot", { name: "Flex v2", allowedRoleIds: ["44444"] });

    await expectBumped("ua_row");
    await expectUntouched("ua_template_bystander");
  });
});
