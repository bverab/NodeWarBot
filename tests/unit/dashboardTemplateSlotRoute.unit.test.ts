import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireManageableDashboardGuild = vi.fn();
const updateGuildTemplateRoleSlot = vi.fn();
const deleteGuildTemplateRoleSlot = vi.fn();
const getGuildRoles = vi.fn();

vi.mock("@/lib/server/apiErrors", async () => await vi.importActual("../../apps/dashboard/lib/server/apiErrors"));
vi.mock("@/lib/server/mutationValidation", async () => await vi.importActual("../../apps/dashboard/lib/server/mutationValidation"));
vi.mock("@/lib/eventDateTime", async () => await vi.importActual("../../apps/dashboard/lib/eventDateTime"));
vi.mock("@/lib/server/guildAccess", () => ({ requireManageableDashboardGuild }));
vi.mock("@/lib/server/dashboardData", () => ({ updateGuildTemplateRoleSlot, deleteGuildTemplateRoleSlot }));
vi.mock("@/lib/server/discordGuildConfig", () => ({ getGuildRoles }));

const params = { guildId: "100000000000000001", templateId: "template_1", slotId: "slot_1" };
const { PATCH } = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/[templateId]/slots/[slotId]/route");

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve(params) }
  );
}

describe("PATCH template slot with allowedRoleIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: params.guildId, manageable: true }, availableGuilds: [], session: {} });
    getGuildRoles.mockResolvedValue([{ id: "11111" }, { id: "22222" }]);
    updateGuildTemplateRoleSlot.mockResolvedValue({ id: "template_1" });
  });

  it("hands the allowed roles to the data layer", async () => {
    const response = await patch({ allowedRoleIds: ["11111", "22222"] });

    expect(response.status).toBe(200);
    expect(updateGuildTemplateRoleSlot).toHaveBeenCalledWith(params.guildId, params.templateId, params.slotId, { allowedRoleIds: ["11111", "22222"] });
  });

  it("refuses roles that do not exist in the guild, like the event slot route", async () => {
    const response = await patch({ allowedRoleIds: ["11111", "77777"] });

    expect(response.status).toBe(400);
    expect(updateGuildTemplateRoleSlot).not.toHaveBeenCalled();
  });

  it("does not look roles up when none are sent", async () => {
    const response = await patch({ name: "Renamed" });

    expect(response.status).toBe(200);
    expect(getGuildRoles).not.toHaveBeenCalled();
  });
});
