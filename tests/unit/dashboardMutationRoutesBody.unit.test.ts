import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireManageableDashboardGuild = vi.fn();
const requireDashboardGuild = vi.fn();
const dashboardData = {
  createGuildEventRoleSlot: vi.fn(),
  updateGuildEventRoleSlot: vi.fn(),
  updateGuildEventRoleSlotSeries: vi.fn(),
  deleteGuildEventRoleSlot: vi.fn(),
  reorderGuildEventRoleSlots: vi.fn(),
  createGuildTemplateRoleSlot: vi.fn(),
  updateGuildTemplateRoleSlot: vi.fn(),
  deleteGuildTemplateRoleSlot: vi.fn(),
  reorderGuildTemplateRoleSlots: vi.fn(),
  getGuildTemplateDetail: vi.fn(),
  updateGuildTemplate: vi.fn(),
  getGuildTemplates: vi.fn(),
  createGuildTemplate: vi.fn()
};

vi.mock("@/lib/eventDateTime", async () => await vi.importActual("../../apps/dashboard/lib/eventDateTime"));
vi.mock("@/lib/server/apiErrors", async () => await vi.importActual("../../apps/dashboard/lib/server/apiErrors"));
vi.mock("@/lib/server/mutationValidation", async () => await vi.importActual("../../apps/dashboard/lib/server/mutationValidation"));
vi.mock("@/lib/server/guildAccess", () => ({ requireDashboardGuild, requireManageableDashboardGuild }));
vi.mock("@/lib/server/dashboardData", () => dashboardData);
vi.mock("@/lib/server/discordGuildConfig", () => ({ getGuildRoles: vi.fn(async () => []) }));

const eventSlots = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/[eventId]/slots/route");
const eventSlot = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/[eventId]/slots/[slotId]/route");
const eventReorder = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/[eventId]/slots/reorder/route");
const template = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/[templateId]/route");
const templateSlots = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/[templateId]/slots/route");
const templateSlot = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/[templateId]/slots/[slotId]/route");
const templateReorder = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/[templateId]/slots/reorder/route");

const params = { guildId: "100000000000000001", eventId: "event_1", templateId: "template_1", slotId: "slot_1" };

function request(method: string, rawBody: string) {
  return new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json" }, body: rawBody });
}

const handlers = [
  ["POST event slots", (raw: string) => eventSlots.POST(request("POST", raw), { params: Promise.resolve(params) })],
  ["PATCH event slot", (raw: string) => eventSlot.PATCH(request("PATCH", raw), { params: Promise.resolve(params) })],
  ["PATCH event slot reorder", (raw: string) => eventReorder.PATCH(request("PATCH", raw), { params: Promise.resolve(params) })],
  ["PATCH template", (raw: string) => template.PATCH(request("PATCH", raw), { params: Promise.resolve(params) })],
  ["POST template slots", (raw: string) => templateSlots.POST(request("POST", raw), { params: Promise.resolve(params) })],
  ["PATCH template slot", (raw: string) => templateSlot.PATCH(request("PATCH", raw), { params: Promise.resolve(params) })],
  ["PATCH template slot reorder", (raw: string) => templateReorder.PATCH(request("PATCH", raw), { params: Promise.resolve(params) })]
] as const;

describe("mutation routes reject bodies that are not JSON objects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: params.guildId, manageable: true }, availableGuilds: [], session: {} });
  });

  for (const [name, call] of handlers) {
    it(`${name}: null, an array, text and broken JSON answer 400`, async () => {
      for (const raw of ["null", "[]", '"text"', "42", "{ not json"]) {
        const response = await call(raw);

        expect(response.status, `${name} with ${raw}`).toBe(400);
      }

      for (const fn of Object.values(dashboardData)) {
        expect(fn).not.toHaveBeenCalled();
      }
    });
  }
});

describe("slot reorder routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: params.guildId, manageable: true }, availableGuilds: [], session: {} });
    dashboardData.reorderGuildEventRoleSlots.mockResolvedValue({ id: "event_1" });
    dashboardData.reorderGuildTemplateRoleSlots.mockResolvedValue({ id: "template_1" });
  });

  const slots = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `slot_${index}`, order: index + 1 }));
  const body = (value: unknown) => JSON.stringify({ slots: value });

  it("refuses more than 100 slots and repeated positions", async () => {
    for (const reorder of [
      (raw: string) => eventReorder.PATCH(request("PATCH", raw), { params: Promise.resolve(params) }),
      (raw: string) => templateReorder.PATCH(request("PATCH", raw), { params: Promise.resolve(params) })
    ]) {
      expect((await reorder(body(slots(101)))).status).toBe(400);
      expect((await reorder(body([{ id: "a", order: 1 }, { id: "b", order: 1 }]))).status).toBe(400);
    }

    expect(dashboardData.reorderGuildEventRoleSlots).not.toHaveBeenCalled();
    expect(dashboardData.reorderGuildTemplateRoleSlots).not.toHaveBeenCalled();
  });

  it("passes a valid, normalized order to the data layer", async () => {
    const eventResponse = await eventReorder.PATCH(request("PATCH", body(slots(3))), { params: Promise.resolve(params) });
    const templateResponse = await templateReorder.PATCH(request("PATCH", body(slots(3))), { params: Promise.resolve(params) });

    expect(eventResponse.status).toBe(200);
    expect(templateResponse.status).toBe(200);
    expect(dashboardData.reorderGuildEventRoleSlots).toHaveBeenCalledWith(params.guildId, params.eventId, slots(3));
    expect(dashboardData.reorderGuildTemplateRoleSlots).toHaveBeenCalledWith(params.guildId, params.templateId, slots(3));
  });
});
