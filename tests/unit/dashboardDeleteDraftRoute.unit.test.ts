import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireManageableDashboardGuild = vi.fn();
const deleteGuildDraftEvent = vi.fn();

vi.mock("@/lib/server/guildAccess", () => ({ requireManageableDashboardGuild }));
vi.mock("@/lib/server/dashboardData", () => ({ deleteGuildDraftEvent }));

const { POST } = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/[eventId]/delete-draft/route");

const params = { guildId: "100000000000000001", eventId: "event_1" };
const call = () => POST(new Request("http://localhost/api", { method: "POST" }), { params: Promise.resolve(params) });

describe("POST /api/guilds/[guildId]/events/[eventId]/delete-draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireManageableDashboardGuild.mockResolvedValue({ activeGuild: { id: params.guildId, manageable: true }, availableGuilds: [], session: {} });
  });

  it("deletes a draft", async () => {
    deleteGuildDraftEvent.mockResolvedValue({ status: "deleted" });

    const response = await call();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "deleted" });
  });

  it("answers 409 for an event that has ended, saying why", async () => {
    deleteGuildDraftEvent.mockResolvedValue({ status: "ended" });

    const response = await call();

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/ended/i);
    expect(body.error).not.toMatch(/unpublish/i);
  });

  it("keeps the existing answers for published and missing events", async () => {
    deleteGuildDraftEvent.mockResolvedValueOnce({ status: "not_draft" });
    const published = await call();
    expect(published.status).toBe(409);
    await expect(published.json()).resolves.toEqual({ error: "Unpublish the Discord message before deleting this event." });

    deleteGuildDraftEvent.mockResolvedValueOnce({ status: "not_found" });
    expect((await call()).status).toBe(404);
  });
});
