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

async function createPermissionEvent(eventId = "event_slot_permissions_1", slotId = "slot_permissions_1") {
  await prisma.guild.upsert({
    where: { id: "guild_slot_permissions" },
    update: {},
    create: { id: "guild_slot_permissions" }
  });
  await prisma.event.create({
    data: {
      id: eventId,
      eventType: "war",
      accessMode: "OPEN",
      name: "Slot Permissions",
      type: "Node War",
      guildId: "guild_slot_permissions",
      channelId: "1234567890",
      time: "20:00",
      timezone: "America/Santiago",
      duration: 60,
      closeBeforeMinutes: 0,
      createdAt: new Date("2026-05-05T20:00:00.000Z"),
      closesAt: new Date("2026-05-05T20:50:00.000Z"),
      expiresAt: new Date("2026-05-05T21:00:00.000Z"),
      roleSlots: {
        create: {
          id: slotId,
          position: 0,
          name: "Flex",
          max: 5
        }
      }
    }
  });
}

describe("dashboard event slot permissions", () => {
  it("adds, replaces and clears allowed role IDs on a War slot", async () => {
    const { updateGuildEventRoleSlot } = await import("../../apps/dashboard/lib/server/dashboardData");
    await createPermissionEvent();

    let event = await updateGuildEventRoleSlot("guild_slot_permissions", "event_slot_permissions_1", "slot_permissions_1", {
      allowedRoleIds: ["11111", "22222"]
    });
    expect(event?.roleSlots[0].allowedRoleIds).toEqual(["11111", "22222"]);

    event = await updateGuildEventRoleSlot("guild_slot_permissions", "event_slot_permissions_1", "slot_permissions_1", {
      allowedRoleIds: ["33333"]
    });
    expect(event?.roleSlots[0].allowedRoleIds).toEqual(["33333"]);

    event = await updateGuildEventRoleSlot("guild_slot_permissions", "event_slot_permissions_1", "slot_permissions_1", {
      allowedRoleIds: []
    });
    expect(event?.roleSlots[0].allowedRoleIds).toEqual([]);
  });

  it("rejects slot IDs outside the event", async () => {
    const { updateGuildEventRoleSlot } = await import("../../apps/dashboard/lib/server/dashboardData");
    await createPermissionEvent("event_slot_permissions_2", "slot_permissions_2");
    const event = await updateGuildEventRoleSlot("guild_slot_permissions", "event_slot_permissions_2", "missing_slot", {
      allowedRoleIds: ["11111"]
    });

    expect(event).toBeNull();
  });
});
