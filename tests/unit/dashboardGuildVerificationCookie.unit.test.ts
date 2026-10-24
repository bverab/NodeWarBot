import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const SECRET = "unit-test-secret";
const LEGACY_FIXED_SECRET = "spectre-dashboard-dev-secret";

const guilds = [
  { id: "100000000000000001", name: "Node War", icon: null, owner: false, manageable: true }
];

function signWith(secret: string, body: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

function forgeCookie(secret: string, payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signWith(secret, body)}`;
}

async function load() {
  return await import("../../apps/dashboard/lib/server/dashboardGuildVerificationCookie");
}

describe("verified guilds cookie", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXTAUTH_SECRET", SECRET);
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("DISCORD_CLIENT_SECRET", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("round-trips the guilds for the user the cookie was issued to", async () => {
    const { createVerifiedGuildsCookie, readVerifiedGuildsFromCookieValue } = await load();

    const cookie = createVerifiedGuildsCookie(guilds, "user_1");

    expect(cookie).not.toBeNull();
    expect(cookie?.name).toBe("spectre_verified_guilds");
    expect(readVerifiedGuildsFromCookieValue(cookie?.value, "user_1")).toEqual(guilds);
  });

  it("rejects the cookie when it belongs to another user", async () => {
    const { createVerifiedGuildsCookie, readVerifiedGuildsFromCookieValue } = await load();
    const value = createVerifiedGuildsCookie(guilds, "user_1")?.value;

    expect(readVerifiedGuildsFromCookieValue(value, "user_2")).toEqual([]);
    expect(readVerifiedGuildsFromCookieValue(value, undefined)).toEqual([]);
    expect(readVerifiedGuildsFromCookieValue(value, "")).toEqual([]);
  });

  it("does not issue a cookie without a user id", async () => {
    const { createVerifiedGuildsCookie } = await load();

    expect(createVerifiedGuildsCookie(guilds, undefined)).toBeNull();
    expect(createVerifiedGuildsCookie(guilds, "")).toBeNull();
  });

  it("rejects a cookie whose signature was altered, including signatures of a different length", async () => {
    const { createVerifiedGuildsCookie, readVerifiedGuildsFromCookieValue } = await load();
    const value = createVerifiedGuildsCookie(guilds, "user_1")?.value as string;
    const [body, signature] = value.split(".");
    const flipped = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    for (const tampered of [`${body}.${flipped}`, `${body}.short`, `${body}.`, `${body}.${signature}extra`, body]) {
      expect(readVerifiedGuildsFromCookieValue(tampered, "user_1")).toEqual([]);
    }
  });

  it("rejects a cookie whose payload was edited to impersonate another user", async () => {
    const { createVerifiedGuildsCookie, readVerifiedGuildsFromCookieValue } = await load();
    const value = createVerifiedGuildsCookie(guilds, "user_1")?.value as string;
    const [body, signature] = value.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, userId: "user_2" })).toString("base64url");

    expect(readVerifiedGuildsFromCookieValue(`${forgedBody}.${signature}`, "user_2")).toEqual([]);
  });

  it("rejects cookies in the legacy format that carry no user id", async () => {
    const { readVerifiedGuildsFromCookieValue } = await load();
    const legacy = forgeCookie(SECRET, { expiresAt: Date.now() + 60_000, guilds });

    expect(readVerifiedGuildsFromCookieValue(legacy, "user_1")).toEqual([]);
  });

  it("rejects an expired cookie", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { createVerifiedGuildsCookie, readVerifiedGuildsFromCookieValue } = await load();
    const value = createVerifiedGuildsCookie(guilds, "user_1")?.value;

    vi.setSystemTime(new Date("2026-01-01T00:04:59.000Z"));
    expect(readVerifiedGuildsFromCookieValue(value, "user_1")).toEqual(guilds);

    vi.setSystemTime(new Date("2026-01-01T00:05:01.000Z"));
    expect(readVerifiedGuildsFromCookieValue(value, "user_1")).toEqual([]);
  });

  it("compares signatures with crypto.timingSafeEqual", async () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    const { createVerifiedGuildsCookie, readVerifiedGuildsFromCookieValue } = await load();
    const value = createVerifiedGuildsCookie(guilds, "user_1")?.value;

    readVerifiedGuildsFromCookieValue(value, "user_1");

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when there is no cookie", async () => {
    const { readVerifiedGuildsFromCookieValue } = await load();

    expect(readVerifiedGuildsFromCookieValue(undefined, "user_1")).toEqual([]);
    expect(readVerifiedGuildsFromCookieValue("", "user_1")).toEqual([]);
  });

  describe("without a configured secret", () => {
    beforeEach(() => {
      vi.stubEnv("NEXTAUTH_SECRET", "");
    });

    it("never falls back to a fixed secret in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const { createVerifiedGuildsCookie, readVerifiedGuildsFromCookieValue } = await load();

      expect(createVerifiedGuildsCookie(guilds, "user_1")).toBeNull();

      const forged = forgeCookie(LEGACY_FIXED_SECRET, { expiresAt: Date.now() + 60_000, userId: "user_1", guilds });
      expect(readVerifiedGuildsFromCookieValue(forged, "user_1")).toEqual([]);
    });

    it("uses a development fallback outside production and warns about it", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { createVerifiedGuildsCookie, readVerifiedGuildsFromCookieValue } = await load();

      const cookie = createVerifiedGuildsCookie(guilds, "user_1");

      expect(cookie).not.toBeNull();
      expect(readVerifiedGuildsFromCookieValue(cookie?.value, "user_1")).toEqual(guilds);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("NEXTAUTH_SECRET");
    });
  });
});
