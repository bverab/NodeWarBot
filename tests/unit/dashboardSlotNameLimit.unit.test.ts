import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The bot trims role names to 60 characters (normalizeRole) on every rewrite. A longer name stored by the dashboard would be
// cut there, and two names sharing their first 60 characters would then collide on @@unique([eventId, name]).
const requireManageableDashboardGuild = vi.fn();
const dashboardData = {
  createGuildEventRoleSlot: vi.fn(),
  updateGuildEventRoleSlot: vi.fn(),
  updateGuildEventRoleSlotSeries: vi.fn(),
  createGuildTemplateRoleSlot: vi.fn(),
  updateGuildTemplateRoleSlot: vi.fn(),
  createGuildTemplate: vi.fn(),
  getGuildTemplates: vi.fn()
};

vi.mock("@/lib/eventDateTime", async () => await vi.importActual("../../apps/dashboard/lib/eventDateTime"));
vi.mock("@/lib/server/apiErrors", async () => await vi.importActual("../../apps/dashboard/lib/server/apiErrors"));
vi.mock("@/lib/server/mutationValidation", async () => await vi.importActual("../../apps/dashboard/lib/server/mutationValidation"));
vi.mock("@/lib/server/guildAccess", () => ({ requireManageableDashboardGuild, requireDashboardGuild: vi.fn() }));
vi.mock("@/lib/server/dashboardData", () => dashboardData);
vi.mock("@/lib/server/discordGuildConfig", () => ({ getGuildRoles: vi.fn(async () => []) }));

const { parseRoleSlotPatch } = await import("../../apps/dashboard/lib/server/mutationValidation");
const { createEventSchema } = await import("../../apps/dashboard/lib/server/createEventValidation");
const eventSlots = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/[eventId]/slots/route");
const eventSlot = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/[eventId]/slots/[slotId]/route");
const templates = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/route");
const templateSlots = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/[templateId]/slots/route");
const templateSlot = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/[templateId]/slots/[slotId]/route");

const MESSAGE = "Slot name must be 60 characters or fewer.";
const params = { guildId: "100000000000000001", eventId: "event_1", templateId: "template_1", slotId: "slot_1" };

describe("parseRoleSlotPatch slot name length", () => {
  it("accepts up to 60 characters and rejects more with a clear message instead of cutting the name", () => {
    expect(parseRoleSlotPatch({ name: "n".repeat(60) })).toEqual({ patch: { name: "n".repeat(60) } });
    expect(parseRoleSlotPatch({ name: "n".repeat(61) })).toEqual({ error: MESSAGE });
    expect(parseRoleSlotPatch({ name: "n".repeat(80) })).toEqual({ error: MESSAGE });
    expect(parseRoleSlotPatch({ name: "n".repeat(200) })).toEqual({ error: MESSAGE });
  });

  it("measures the trimmed name", () => {
    expect(parseRoleSlotPatch({ name: `   ${"n".repeat(60)}   ` })).toEqual({ patch: { name: "n".repeat(60) } });
    expect(parseRoleSlotPatch({ name: "   " })).toEqual({ error: "Slot name cannot be empty." });
  });

  it("applies when creating a slot too", () => {
    expect(parseRoleSlotPatch({ name: "n".repeat(61), max: 3 }, true)).toEqual({ error: MESSAGE });
    expect(parseRoleSlotPatch({ name: "n".repeat(60), max: 3 }, true)).toMatchObject({ patch: { name: "n".repeat(60), max: 3 } });
  });
});

describe("createEventSchema slot name length", () => {
  const base = {
    name: "Test war",
    eventType: "war",
    type: "Evento de guerra",
    date: "2030-05-05",
    time: "20:00",
    timezone: "America/Santiago",
    duration: 60,
    closeBeforeMinutes: 10
  };

  it("accepts a 60 character slot name and rejects 61 with the same message", () => {
    expect(createEventSchema.safeParse({ ...base, slots: [{ name: "n".repeat(60), max: 5 }] }).success).toBe(true);

    const result = createEventSchema.safeParse({ ...base, slots: [{ name: "n".repeat(61), max: 5 }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({ path: ["slots", 0, "name"], message: MESSAGE });
    }
  });
});

describe("routes that store slot names", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: params.guildId, manageable: true }, availableGuilds: [], session: {} });
  });

  const json = (method: string, body: unknown) =>
    new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const long = "n".repeat(61);

  it("refuse a 61 character name when creating or editing event slots (single and whole series)", async () => {
    const created = await eventSlots.POST(json("POST", { name: long, max: 3 }), { params: Promise.resolve(params) });
    const edited = await eventSlot.PATCH(json("PATCH", { name: long }), { params: Promise.resolve(params) });
    const editedSeries = await eventSlot.PATCH(json("PATCH", { name: long, recurrenceScope: "series" }), { params: Promise.resolve(params) });

    for (const response of [created, edited, editedSeries]) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: MESSAGE });
    }
    expect(dashboardData.createGuildEventRoleSlot).not.toHaveBeenCalled();
    expect(dashboardData.updateGuildEventRoleSlot).not.toHaveBeenCalled();
    expect(dashboardData.updateGuildEventRoleSlotSeries).not.toHaveBeenCalled();
  });

  it("refuse it for template slots too, because they are copied into events", async () => {
    const createdTemplate = await templates.POST(
      json("POST", { name: "Template", eventType: "war", typeDefault: "Node War", timezone: "America/Santiago", slots: [{ name: long, max: 3 }] }),
      { params: Promise.resolve(params) }
    );
    const createdSlot = await templateSlots.POST(json("POST", { name: long, max: 3 }), { params: Promise.resolve(params) });
    const editedSlot = await templateSlot.PATCH(json("PATCH", { name: long }), { params: Promise.resolve(params) });

    expect(createdTemplate.status).toBe(400);
    await expect(createdTemplate.json()).resolves.toEqual({ error: MESSAGE });
    for (const response of [createdSlot, editedSlot]) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: MESSAGE });
    }
    expect(dashboardData.createGuildTemplate).not.toHaveBeenCalled();
    expect(dashboardData.createGuildTemplateRoleSlot).not.toHaveBeenCalled();
    expect(dashboardData.updateGuildTemplateRoleSlot).not.toHaveBeenCalled();
  });

  it("still accept a 60 character name", async () => {
    dashboardData.createGuildEventRoleSlot.mockResolvedValue({ roleSlots: [] });

    const created = await eventSlots.POST(json("POST", { name: "n".repeat(60), max: 3 }), { params: Promise.resolve(params) });

    expect(created.status).toBe(201);
    expect(dashboardData.createGuildEventRoleSlot).toHaveBeenCalledWith(params.guildId, params.eventId, expect.objectContaining({ name: "n".repeat(60) }));
  });
});
