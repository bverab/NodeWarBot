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

const GUILD_ID = "guild_template_slot_names";

const draftInput = (templateId: string) => ({
  name: "From template",
  eventType: "war",
  type: "Node War",
  date: "2030-05-05",
  time: "20:00",
  timezone: "America/Santiago",
  duration: 60,
  closeBeforeMinutes: 10,
  templateId
});

async function seedTemplate(id: string, slotNames: string[]) {
  await prisma.guild.upsert({ where: { id: GUILD_ID }, update: {}, create: { id: GUILD_ID } });
  await prisma.eventTemplate.create({
    data: {
      id,
      guildId: GUILD_ID,
      name: id,
      eventType: "war",
      roleSlots: { create: slotNames.map((name, position) => ({ position, name, max: 1 })) }
    }
  });
}

describe("creating a draft from a template", () => {
  it("copies slot names of up to 60 characters", async () => {
    const { createGuildEventDraft } = await import("../../apps/dashboard/lib/server/dashboardData");
    await seedTemplate("tpl_ok", ["a".repeat(60), "Flex"]);

    const event = await createGuildEventDraft(GUILD_ID, "creator_1", draftInput("tpl_ok"));

    const slots = await prisma.eventRoleSlot.findMany({ where: { eventId: event.id }, orderBy: { position: "asc" } });
    expect(slots.map((slot) => slot.name)).toEqual(["a".repeat(60), "Flex"]);
  });

  it("refuses a template whose slot names are longer than the bot keeps, without creating anything", async () => {
    const { createGuildEventDraft } = await import("../../apps/dashboard/lib/server/dashboardData");
    // Same first 60 characters: after the bot cut them they would collide.
    await seedTemplate("tpl_long", [`${"a".repeat(60)}1`, `${"a".repeat(60)}2`]);

    await expect(createGuildEventDraft(GUILD_ID, "creator_1", draftInput("tpl_long"))).rejects.toMatchObject({
      name: "InputError",
      status: 400,
      message: expect.stringContaining("60 characters")
    });

    expect(await prisma.event.count({ where: { guildId: GUILD_ID } })).toBe(0);
  });
});
