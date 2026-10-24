import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireDashboardGuild = vi.fn();
const requireManageableDashboardGuild = vi.fn();
const createGuildEventDraft = vi.fn();
const getGuildEvents = vi.fn();
const createGuildTemplate = vi.fn();
const getGuildTemplates = vi.fn();
const updateGuildTemplate = vi.fn();
const getGuildTemplateDetail = vi.fn();
const getGuildRoles = vi.fn();
const getGuildPostChannels = vi.fn();
const getGuildPostChannelById = vi.fn();

vi.mock("@/lib/apiGuards", async () => await vi.importActual("../../apps/dashboard/lib/apiGuards"));
vi.mock("@/lib/eventDateTime", async () => await vi.importActual("../../apps/dashboard/lib/eventDateTime"));
vi.mock("@/lib/server/apiErrors", async () => await vi.importActual("../../apps/dashboard/lib/server/apiErrors"));
vi.mock("@/lib/server/createEventValidation", async () => await vi.importActual("../../apps/dashboard/lib/server/createEventValidation"));
vi.mock("@/lib/server/mutationValidation", async () => await vi.importActual("../../apps/dashboard/lib/server/mutationValidation"));
vi.mock("@/lib/server/dashboardGuildVerificationCookie", () => ({ createVerifiedGuildsCookie: () => null }));
vi.mock("@/lib/server/guildAccess", () => ({ requireDashboardGuild, requireManageableDashboardGuild }));
vi.mock("@/lib/server/dashboardData", () => ({
  createGuildEventDraft,
  getGuildEvents,
  createGuildTemplate,
  getGuildTemplates,
  updateGuildTemplate,
  getGuildTemplateDetail
}));
vi.mock("@/lib/server/discordGuildConfig", () => ({ getGuildRoles, getGuildPostChannels, getGuildPostChannelById }));

const GUILD_ID = "100000000000000001";
const { InputError, errorResponse, mapPrismaError } = await import("../../apps/dashboard/lib/server/apiErrors");
const eventsRoute = await import("../../apps/dashboard/app/api/guilds/[guildId]/events/route");
const templatesRoute = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/route");
const templateRoute = await import("../../apps/dashboard/app/api/guilds/[guildId]/templates/[templateId]/route");

function prismaError(code: string, message = "Invalid `prisma.event.create()` invocation: Unique constraint failed on the fields: (`messageId`)") {
  return Object.assign(new Error(message), { name: "PrismaClientKnownRequestError", code, meta: { target: ["messageId"] } });
}

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("mapPrismaError", () => {
  it("maps unique violations to 409 without echoing database details", () => {
    const mapped = mapPrismaError(prismaError("P2002"));

    expect(mapped).toEqual({ status: 409, message: "That value is already in use." });
    expect(JSON.stringify(mapped)).not.toMatch(/messageId|prisma|Unique constraint/i);
  });

  it("lets the caller word the conflict", () => {
    expect(mapPrismaError(prismaError("P2002"), "A template with that name already exists.")).toEqual({
      status: 409,
      message: "A template with that name already exists."
    });
  });

  it("maps missing records and foreign key failures", () => {
    expect(mapPrismaError(prismaError("P2025"))).toMatchObject({ status: 404 });
    expect(mapPrismaError(prismaError("P2003"))).toMatchObject({ status: 409 });
  });

  it("returns null for anything else", () => {
    expect(mapPrismaError(prismaError("P2024"))).toBeNull();
    expect(mapPrismaError(new Error("boom"))).toBeNull();
    expect(mapPrismaError(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBeNull();
    expect(mapPrismaError(null)).toBeNull();
    expect(mapPrismaError("P2002")).toBeNull();
  });
});

describe("errorResponse", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the message of unexpected errors and logs them on the server", async () => {
    const response = errorResponse(new Error("SQLITE_ERROR: no such table: Event"), "Failed to create template.");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to create template." });
    expect(console.error).toHaveBeenCalled();
  });

  it("keeps the message of errors raised on purpose for the user", async () => {
    const response = errorResponse(new InputError("At least one slot is required to create a draft event."), "Failed.");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "At least one slot is required to create a draft event." });
  });

  it("answers Prisma conflicts with 409", async () => {
    const response = errorResponse(prismaError("P2002"), "Failed.", { conflictMessage: "Name already used." });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Name already used." });
  });
});

describe("routes do not leak internal error messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const access = { activeGuild: { id: GUILD_ID, manageable: true }, availableGuilds: [], session: { user: { id: "u" } }, guildSource: "cookie", guildsStale: false };
    requireManageableDashboardGuild.mockResolvedValue(access);
    requireDashboardGuild.mockResolvedValue(access);
    getGuildRoles.mockResolvedValue([]);
    getGuildPostChannels.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validEvent = {
    name: "Node War",
    eventType: "war",
    type: "Node War",
    date: "2030-05-05",
    time: "20:00",
    timezone: "America/Santiago",
    duration: 60,
    closeBeforeMinutes: 10,
    slots: [{ name: "Flex", max: 5 }]
  };

  it("POST events: an unexpected failure returns a generic message", async () => {
    createGuildEventDraft.mockRejectedValue(new Error("Invalid `prisma.event.create()` invocation: Foreign key constraint failed on the field: `guildId`"));

    const response = await eventsRoute.POST(jsonRequest("POST", validEvent), { params: Promise.resolve({ guildId: GUILD_ID }) });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Failed to create draft event." });
  });

  it("POST events: input errors raised by the data layer stay visible as 400", async () => {
    createGuildEventDraft.mockRejectedValue(new InputError("Template not found for this guild and event type."));

    const response = await eventsRoute.POST(jsonRequest("POST", validEvent), { params: Promise.resolve({ guildId: GUILD_ID }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Template not found for this guild and event type." });
  });

  it("POST templates: a duplicate name is a 409 and never shows the database message", async () => {
    createGuildTemplate.mockRejectedValue(prismaError("P2002", "Unique constraint failed on the fields: (`guildId`,`eventType`,`name`)"));

    const response = await templatesRoute.POST(
      jsonRequest("POST", { name: "Template", eventType: "war", typeDefault: "Node War", timezone: "America/Santiago", slots: [{ name: "Flex", max: 5 }] }),
      { params: Promise.resolve({ guildId: GUILD_ID }) }
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("A template with that name already exists for this event type.");
  });

  it("POST templates: an unexpected failure returns a generic message", async () => {
    createGuildTemplate.mockRejectedValue(new Error("SQLITE_BUSY: database is locked"));

    const response = await templatesRoute.POST(
      jsonRequest("POST", { name: "Template", eventType: "war", typeDefault: "Node War", timezone: "America/Santiago", slots: [{ name: "Flex", max: 5 }] }),
      { params: Promise.resolve({ guildId: GUILD_ID }) }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to create template." });
  });

  it("PATCH template: renaming to an existing name is a 409", async () => {
    updateGuildTemplate.mockRejectedValue(prismaError("P2002"));

    const response = await templateRoute.PATCH(jsonRequest("PATCH", { name: "Taken" }), {
      params: Promise.resolve({ guildId: GUILD_ID, templateId: "template_1" })
    });

    expect(response.status).toBe(409);
  });
});
