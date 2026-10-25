import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ENV_KEYS = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DASHBOARD_ADMIN_USERNAME", "DASHBOARD_ADMIN_PASSWORD_HASH", "NODE_ENV"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      (process.env as Record<string, string>)[key] = value;
    }
  }
}

async function loadLocalAdmin() {
  vi.resetModules();
  return import("../../apps/dashboard/lib/server/localAdmin");
}

// NextAuth v4 keeps the options passed to a provider (custom id, issuer...) in provider.options and merges them at runtime.
async function loadAuthProviders() {
  vi.resetModules();
  const { authOptions } = await import("../../apps/dashboard/lib/auth");
  return authOptions.providers as Array<{ id: string; options?: Record<string, unknown> }>;
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  setEnv(savedEnv);
});

describe("dashboard Discord provider", () => {
  it("declares Discord's issuer so the OAuth callback accepts the iss parameter", async () => {
    setEnv({ DISCORD_CLIENT_ID: "100000000000000001", DISCORD_CLIENT_SECRET: "secret", NODE_ENV: "test" });

    const providers = await loadAuthProviders();
    const discord = providers.find((provider) => provider.id === "discord");

    expect(discord?.options?.issuer).toBe("https://discord.com");
  }, 30_000);
});

describe("dashboard local admin", () => {
  it("verifies the configured username and password against a scrypt hash", async () => {
    const { hashLocalAdminPassword } = await loadLocalAdmin();
    const hash = hashLocalAdminPassword("correct horse battery staple");
    setEnv({ DASHBOARD_ADMIN_USERNAME: "admin", DASHBOARD_ADMIN_PASSWORD_HASH: hash, NODE_ENV: "development" });

    const { verifyLocalAdminCredentials, isLocalAdminEnabled } = await loadLocalAdmin();

    expect(hash).toMatch(/^scrypt:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(isLocalAdminEnabled()).toBe(true);
    expect(verifyLocalAdminCredentials("admin", "correct horse battery staple")).toBe(true);
    expect(verifyLocalAdminCredentials("admin", "wrong password")).toBe(false);
    expect(verifyLocalAdminCredentials("other", "correct horse battery staple")).toBe(false);
    expect(verifyLocalAdminCredentials(undefined, undefined)).toBe(false);
  });

  it("is disabled without configuration, with a malformed hash, and always in production", async () => {
    const { hashLocalAdminPassword } = await loadLocalAdmin();
    const hash = hashLocalAdminPassword("pw-123456");

    setEnv({ NODE_ENV: "development" });
    expect((await loadLocalAdmin()).isLocalAdminEnabled()).toBe(false);

    setEnv({ DASHBOARD_ADMIN_USERNAME: "admin", DASHBOARD_ADMIN_PASSWORD_HASH: "plain-text", NODE_ENV: "development" });
    expect((await loadLocalAdmin()).isLocalAdminEnabled()).toBe(false);

    setEnv({ DASHBOARD_ADMIN_USERNAME: "admin", DASHBOARD_ADMIN_PASSWORD_HASH: hash, NODE_ENV: "production" });
    const production = await loadLocalAdmin();
    expect(production.isLocalAdminEnabled()).toBe(false);
    expect(production.verifyLocalAdminCredentials("admin", "pw-123456")).toBe(false);
  });

  it("adds the local-admin credentials provider only when it is enabled", async () => {
    const { hashLocalAdminPassword } = await loadLocalAdmin();
    const hash = hashLocalAdminPassword("pw-123456");

    setEnv({ DASHBOARD_ADMIN_USERNAME: "admin", DASHBOARD_ADMIN_PASSWORD_HASH: hash, NODE_ENV: "development" });
    expect((await loadAuthProviders()).some((provider) => (provider.options?.id ?? provider.id) === "local-admin")).toBe(true);

    setEnv({ DASHBOARD_ADMIN_USERNAME: "admin", DASHBOARD_ADMIN_PASSWORD_HASH: hash, NODE_ENV: "production" });
    expect((await loadAuthProviders()).some((provider) => (provider.options?.id ?? provider.id) === "local-admin")).toBe(false);

    setEnv({ NODE_ENV: "development" });
    expect((await loadAuthProviders()).some((provider) => (provider.options?.id ?? provider.id) === "local-admin")).toBe(false);
  }, 30_000);

  it("recognises only local-admin sessions while the local admin is enabled", async () => {
    const { hashLocalAdminPassword } = await loadLocalAdmin();
    const hash = hashLocalAdminPassword("pw-123456");
    setEnv({ DASHBOARD_ADMIN_USERNAME: "admin", DASHBOARD_ADMIN_PASSWORD_HASH: hash, NODE_ENV: "development" });
    const { isLocalAdminSession } = await loadLocalAdmin();

    expect(isLocalAdminSession({ provider: "local-admin", user: { id: "local-admin" }, expires: "" })).toBe(true);
    expect(isLocalAdminSession({ provider: "discord", user: { id: "local-admin" }, expires: "" })).toBe(false);
    expect(isLocalAdminSession({ provider: "local-admin", user: { id: "123456789012345678" }, expires: "" })).toBe(false);
    expect(isLocalAdminSession(null)).toBe(false);

    setEnv({ NODE_ENV: "development" });
    const disabled = await loadLocalAdmin();
    expect(disabled.isLocalAdminSession({ provider: "local-admin", user: { id: "local-admin" }, expires: "" })).toBe(false);
  });
});
