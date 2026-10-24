import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const GUILD_ID = "100000000000000001";
const userId = (index: number) => String(200000000000000000n + BigInt(index));

function memberResponse(id: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ nick: `Nick ${id}`, user: { id, username: `user${id}`, avatar: null } })
  } as Response;
}

// A fetch that stays "in flight" for a tick so concurrency can be measured.
function mockMemberFetch(options: { status?: (id: string) => number } = {}) {
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight -= 1;
    const id = String(input).split("/").pop() as string;
    return memberResponse(id, options.status?.(id) ?? 200);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, getMaxInFlight: () => maxInFlight };
}

async function load() {
  return await import("../../apps/dashboard/lib/server/discordMembers");
}

describe("fetchDiscordGuildMembers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("TOKEN", "bot-token");
    vi.stubEnv("DISCORD_BOT_TOKEN", "");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never has more than 5 lookups in flight", async () => {
    const { fetchMock, getMaxInFlight } = mockMemberFetch();
    const { fetchDiscordGuildMembers } = await load();
    const ids = Array.from({ length: 100 }, (_, index) => userId(index));

    const members = await fetchDiscordGuildMembers(GUILD_ID, ids);

    expect(members.size).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(100);
    expect(getMaxInFlight()).toBeLessThanOrEqual(5);
    expect(getMaxInFlight()).toBeGreaterThan(1);
    expect(members.get(userId(7))).toMatchObject({ id: userId(7), displayName: `Nick ${userId(7)}` });
  });

  it("answers a second load from the cache without calling Discord", async () => {
    const { fetchMock } = mockMemberFetch();
    const { fetchDiscordGuildMembers } = await load();
    const ids = Array.from({ length: 100 }, (_, index) => userId(index));

    await fetchDiscordGuildMembers(GUILD_ID, ids);
    fetchMock.mockClear();
    const again = await fetchDiscordGuildMembers(GUILD_ID, ids);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(again.get(userId(3))?.displayName).toBe(`Nick ${userId(3)}`);
  });

  it("only looks up the members that are missing from the cache", async () => {
    const { fetchMock } = mockMemberFetch();
    const { fetchDiscordGuildMembers } = await load();

    await fetchDiscordGuildMembers(GUILD_ID, [userId(1), userId(2)]);
    fetchMock.mockClear();
    await fetchDiscordGuildMembers(GUILD_ID, [userId(2), userId(3)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(userId(3));
  });

  it("keys the cache by guild", async () => {
    const { fetchMock } = mockMemberFetch();
    const { fetchDiscordGuildMembers } = await load();

    await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);
    await fetchDiscordGuildMembers("100000000000000002", [userId(1)]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("expires cached members after 5 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { fetchMock } = mockMemberFetch();
    const { fetchDiscordGuildMembers } = await load();

    await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);
    vi.setSystemTime(new Date("2026-01-01T00:04:59.000Z"));
    await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:05:01.000Z"));
    await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one lookup between concurrent loads of the same member", async () => {
    const { fetchMock } = mockMemberFetch();
    const { fetchDiscordGuildMembers } = await load();

    await Promise.all([
      fetchDiscordGuildMembers(GUILD_ID, [userId(1), userId(2)]),
      fetchDiscordGuildMembers(GUILD_ID, [userId(1), userId(2)])
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the raw id for members Discord cannot return, and remembers a missing member for the full TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { fetchMock } = mockMemberFetch({ status: (id) => (id === userId(1) ? 404 : 200) });
    const { fetchDiscordGuildMembers } = await load();

    const members = await fetchDiscordGuildMembers(GUILD_ID, [userId(1), userId(2)]);
    expect(members.get(userId(1))).toMatchObject({ id: userId(1), displayName: userId(1), avatarUrl: null });
    expect(members.get(userId(2))?.displayName).toBe(`Nick ${userId(2)}`);

    fetchMock.mockClear();
    vi.setSystemTime(new Date("2026-01-01T00:04:00.000Z"));
    await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries transient failures soon instead of caching them for 5 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    let status = 429;
    const { fetchMock } = mockMemberFetch({ status: () => status });
    const { fetchDiscordGuildMembers } = await load();

    const first = await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);
    expect(first.get(userId(1))?.displayName).toBe(userId(1));

    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
    await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    status = 200;
    vi.setSystemTime(new Date("2026-01-01T00:00:31.000Z"));
    const recovered = await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recovered.get(userId(1))?.displayName).toBe(`Nick ${userId(1)}`);
  });

  it("survives a network error and keeps the fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const { fetchDiscordGuildMembers } = await load();

    const members = await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);

    expect(members.get(userId(1))).toMatchObject({ displayName: userId(1) });
  });

  it("returns fallbacks without calling Discord when there is no bot token", async () => {
    vi.stubEnv("TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchDiscordGuildMembers } = await load();

    const members = await fetchDiscordGuildMembers(GUILD_ID, [userId(1)]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(members.get(userId(1))?.displayName).toBe(userId(1));
  });
});
