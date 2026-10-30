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

const GUILD_ID = "guild_template_slot_permissions";

async function createTemplate(templateId: string, slotId: string) {
  await prisma.guild.upsert({ where: { id: GUILD_ID }, update: {}, create: { id: GUILD_ID } });
  await prisma.eventTemplate.create({
    data: {
      id: templateId,
      guildId: GUILD_ID,
      name: `Template ${templateId}`,
      eventType: "war",
      roleSlots: {
        create: [
          { id: slotId, position: 0, name: "Flex", max: 5 },
          { id: `${slotId}_other`, position: 1, name: "Tank", max: 2 }
        ]
      }
    }
  });
}

async function permissionsOf(slotId: string) {
  const rows = await prisma.eventTemplateRolePermission.findMany({ where: { roleSlotId: slotId }, orderBy: { discordRoleId: "asc" } });
  return rows.map((row) => row.discordRoleId);
}

describe("dashboard template slot permissions", () => {
  it("adds, replaces and clears allowed role IDs on a template slot", async () => {
    const { updateGuildTemplateRoleSlot } = await import("../../apps/dashboard/lib/server/dashboardData");
    await createTemplate("template_perm_1", "tslot_perm_1");

    let template = await updateGuildTemplateRoleSlot(GUILD_ID, "template_perm_1", "tslot_perm_1", { allowedRoleIds: ["11111", "22222", "11111"] });
    expect(template?.roleSlots.find((slot) => slot.id === "tslot_perm_1")?.permissions.map((permission) => permission.discordRoleId).sort()).toEqual(["11111", "22222"]);
    expect(await permissionsOf("tslot_perm_1")).toEqual(["11111", "22222"]);

    template = await updateGuildTemplateRoleSlot(GUILD_ID, "template_perm_1", "tslot_perm_1", { allowedRoleIds: ["33333"] });
    expect(await permissionsOf("tslot_perm_1")).toEqual(["33333"]);

    template = await updateGuildTemplateRoleSlot(GUILD_ID, "template_perm_1", "tslot_perm_1", { allowedRoleIds: [] });
    expect(await permissionsOf("tslot_perm_1")).toEqual([]);
    expect(template?.id).toBe("template_perm_1");
  });

  it("updates the slot fields and its roles together, without touching other slots", async () => {
    const { updateGuildTemplateRoleSlot } = await import("../../apps/dashboard/lib/server/dashboardData");
    await createTemplate("template_perm_2", "tslot_perm_2");
    await prisma.eventTemplateRolePermission.create({ data: { roleSlotId: "tslot_perm_2_other", discordRoleId: "99999" } });

    const template = await updateGuildTemplateRoleSlot(GUILD_ID, "template_perm_2", "tslot_perm_2", {
      name: "Flex renamed",
      max: 8,
      allowedRoleIds: ["44444"]
    });

    const slot = template?.roleSlots.find((entry) => entry.id === "tslot_perm_2");
    expect(slot).toMatchObject({ name: "Flex renamed", max: 8 });
    expect(await permissionsOf("tslot_perm_2")).toEqual(["44444"]);
    expect(await permissionsOf("tslot_perm_2_other")).toEqual(["99999"]);
  });

  it("still updates plain fields when no roles are sent and leaves existing roles alone", async () => {
    const { updateGuildTemplateRoleSlot } = await import("../../apps/dashboard/lib/server/dashboardData");
    await createTemplate("template_perm_3", "tslot_perm_3");
    await prisma.eventTemplateRolePermission.create({ data: { roleSlotId: "tslot_perm_3", discordRoleId: "55555" } });

    await updateGuildTemplateRoleSlot(GUILD_ID, "template_perm_3", "tslot_perm_3", { max: 9 });

    expect(await prisma.eventTemplateRoleSlot.findUnique({ where: { id: "tslot_perm_3" } })).toMatchObject({ max: 9 });
    expect(await permissionsOf("tslot_perm_3")).toEqual(["55555"]);
  });

  it("rejects slot IDs outside the template or guild", async () => {
    const { updateGuildTemplateRoleSlot } = await import("../../apps/dashboard/lib/server/dashboardData");
    await createTemplate("template_perm_4", "tslot_perm_4");

    expect(await updateGuildTemplateRoleSlot(GUILD_ID, "template_perm_4", "missing_slot", { allowedRoleIds: ["11111"] })).toBeNull();
    expect(await updateGuildTemplateRoleSlot("another_guild", "template_perm_4", "tslot_perm_4", { allowedRoleIds: ["11111"] })).toBeNull();
    expect(await permissionsOf("tslot_perm_4")).toEqual([]);
  });
});
