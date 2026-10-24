import { afterEach, describe, expect, it, vi } from "vitest";

describe("dashboard auth callbacks", () => {
  afterEach(() => {
    vi.resetModules();
  });

  async function loadCallbacks() {
    const { authOptions } = await import("../../apps/dashboard/lib/auth");
    return authOptions.callbacks as {
      jwt: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
      session: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
  }

  it("stores the sign-in provider in the token at sign-in", async () => {
    const callbacks = await loadCallbacks();

    const token = await callbacks.jwt({
      token: {},
      account: { provider: "discord", access_token: "discord-token", providerAccountId: "123456789012345678" }
    });

    expect(token).toMatchObject({ provider: "discord", accessToken: "discord-token", userId: "123456789012345678" });

    const googleToken = await callbacks.jwt({
      token: {},
      account: { provider: "google", access_token: "google-token", providerAccountId: "google-sub" }
    });
    expect(googleToken).toMatchObject({ provider: "google" });
  });

  it("keeps the stored provider on later requests, where no account is passed", async () => {
    const callbacks = await loadCallbacks();

    const token = await callbacks.jwt({ token: { provider: "google", userId: "google-sub" } });

    expect(token).toMatchObject({ provider: "google", userId: "google-sub" });
  });

  it("does not invent a provider for tokens issued before it was stored", async () => {
    const callbacks = await loadCallbacks();

    const token = await callbacks.jwt({ token: { accessToken: "old-token", userId: "123456789012345678" } });
    const session = await callbacks.session({ session: { user: {} }, token });

    expect(token.provider).toBeUndefined();
    expect(session.provider).toBeUndefined();
  });

  it("exposes the provider in the session", async () => {
    const callbacks = await loadCallbacks();

    const session = await callbacks.session({
      session: { user: {} },
      token: { provider: "google", accessToken: "google-token", userId: "google-sub" }
    });

    expect(session).toMatchObject({ provider: "google", accessToken: "google-token", user: { id: "google-sub" } });
  });
});
