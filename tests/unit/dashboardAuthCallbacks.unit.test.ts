import { describe, expect, it } from "vitest";

// Loaded once at file level: the cold import of next-auth and its providers is slow and must not eat a test's timeout.
const { authOptions } = await import("../../apps/dashboard/lib/auth");
const callbacks = authOptions.callbacks as {
  jwt: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  session: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

describe("dashboard auth callbacks", () => {
  it("stores the sign-in provider in the token at sign-in", async () => {
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
    const token = await callbacks.jwt({ token: { provider: "google", userId: "google-sub" } });

    expect(token).toMatchObject({ provider: "google", userId: "google-sub" });
  });

  it("does not invent a provider for tokens issued before it was stored", async () => {
    const token = await callbacks.jwt({ token: { accessToken: "old-token", userId: "123456789012345678" } });
    const session = await callbacks.session({ session: { user: {} }, token });

    expect(token.provider).toBeUndefined();
    expect(session.provider).toBeUndefined();
  });

  it("exposes the provider in the session", async () => {
    const session = await callbacks.session({
      session: { user: {} },
      token: { provider: "google", accessToken: "google-token", userId: "google-sub" }
    });

    expect(session).toMatchObject({ provider: "google", accessToken: "google-token", user: { id: "google-sub" } });
  });
});
