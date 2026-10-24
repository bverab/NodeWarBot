import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = 1_000_000_000_000_000_000n;
const guildId = (index: number) => String(BASE + BigInt(index));

function page(from: number, count: number) {
  return Array.from({ length: count }, (_, offset) => ({ id: guildId(from + offset), name: `Guild ${from + offset}` }));
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    clone() {
      return this;
    }
  } as unknown as Response;
}

// Serves `total` guilds in ascending id order, honouring limit/after like Discord does.
function mockBotGuilds(total: number) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const limit = Number(url.searchParams.get("limit") ?? 200);
    const after = url.searchParams.get("after");
    const all = page(0, total);
    const start = after ? all.findIndex((guild) => BigInt(guild.id) > BigInt(after)) : 0;
    return jsonResponse(start === -1 ? [] : all.slice(start, start + limit));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function load() {
  return await import("../../apps/dashboard/lib/discord");
}

describe("fetchBotGuildIds", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("walks every page with `after` until Discord has no more guilds", async () => {
    const fetchMock = mockBotGuilds(250);
    const { fetchBotGuildIds } = await load();

    const ids = await fetchBotGuildIds();

    expect(ids.size).toBe(250);
    expect(ids.has(guildId(0))).toBe(true);
    expect(ids.has(guildId(249))).toBe(true);
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls).toHaveLength(2);
    expect(urls[0].searchParams.get("limit")).toBe("200");
    expect(urls[0].searchParams.get("after")).toBeNull();
    expect(urls[1].searchParams.get("after")).toBe(guildId(199));
  });

  it("asks for one more page when the last one is exactly full", async () => {
    const fetchMock = mockBotGuilds(200);
    const { fetchBotGuildIds } = await load();

    const ids = await fetchBotGuildIds();

    expect(ids.size).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("needs a single request for a small bot", async () => {
    const fetchMock = mockBotGuilds(3);
    const { fetchBotGuildIds } = await load();

    expect((await fetchBotGuildIds()).size).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves a 60 second cache shared by every caller", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const fetchMock = mockBotGuilds(3);
    const { fetchBotGuildIds } = await load();

    await fetchBotGuildIds();
    vi.setSystemTime(new Date("2026-01-01T00:00:59.000Z"));
    await fetchBotGuildIds();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z"));
    await fetchBotGuildIds();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent callers into a single lookup", async () => {
    const fetchMock = mockBotGuilds(250);
    const { fetchBotGuildIds } = await load();

    const results = await Promise.all([fetchBotGuildIds(), fetchBotGuildIds(), fetchBotGuildIds()]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results[0]).toBe(results[1]);
    expect(results[1].size).toBe(250);
  });

  it("does not cache failures and surfaces rate limits", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "slow down", retry_after: 2 }, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(jsonResponse(page(0, 2)));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchBotGuildIds } = await load();

    await expect(fetchBotGuildIds()).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 2000 });
    await expect(fetchBotGuildIds()).resolves.toHaveProperty("size", 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails on a later page without caching the partial list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(0, 200)))
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse(page(0, 2)));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchBotGuildIds } = await load();

    await expect(fetchBotGuildIds()).rejects.toMatchObject({ code: "bot_guilds_failed", status: 500 });
    await expect(fetchBotGuildIds()).resolves.toHaveProperty("size", 2);
  });

  it("reports a missing bot token without calling Discord", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "");
    vi.stubEnv("TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchBotGuildIds } = await load();

    await expect(fetchBotGuildIds()).rejects.toMatchObject({ code: "missing_bot_token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
