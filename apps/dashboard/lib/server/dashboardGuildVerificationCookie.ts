import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { DashboardGuildSummary } from "@/lib/dashboardGuilds";

const COOKIE_NAME = "spectre_verified_guilds";
const COOKIE_MAX_AGE_SECONDS = 5 * 60;

type VerifiedGuildPayload = {
  expiresAt: number;
  guilds: DashboardGuildSummary[];
};

function getSecret() {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.DISCORD_CLIENT_SECRET || "spectre-dashboard-dev-secret";
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function encodePayload(payload: VerifiedGuildPayload) {
  const body = base64Url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function decodePayload(value: string | undefined): VerifiedGuildPayload | null {
  if (!value) {
    return null;
  }

  const [body, signature] = value.split(".");
  if (!body || !signature || signature !== sign(body)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as VerifiedGuildPayload;
    if (!Array.isArray(payload.guilds) || payload.expiresAt < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function createVerifiedGuildsCookie(guilds: DashboardGuildSummary[]) {
  return {
    name: COOKIE_NAME,
    value: encodePayload({
      expiresAt: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000,
      guilds
    }),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS
    }
  };
}

export async function readVerifiedGuildsCookie() {
  const store = await cookies();
  return decodePayload(store.get(COOKIE_NAME)?.value)?.guilds ?? [];
}
