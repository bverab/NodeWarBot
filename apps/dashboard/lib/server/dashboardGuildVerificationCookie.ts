import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { DashboardGuildSummary } from "@/lib/dashboardGuilds";

const COOKIE_NAME = "spectre_verified_guilds";
const COOKIE_MAX_AGE_SECONDS = 5 * 60;
const DEV_FALLBACK_SECRET = "spectre-dashboard-dev-secret";

type VerifiedGuildPayload = {
  expiresAt: number;
  userId: string;
  guilds: DashboardGuildSummary[];
};

let warnedAboutDevSecret = false;

// No secret means no cookie in production: a fixed, publicly known key would let anyone forge guild access.
function getSecret(): string | null {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.DISCORD_CLIENT_SECRET;
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  if (!warnedAboutDevSecret) {
    warnedAboutDevSecret = true;
    console.warn("[dashboard:guild-cookie] NEXTAUTH_SECRET is not set; using an insecure development secret for the verified guilds cookie.");
  }

  return DEV_FALLBACK_SECRET;
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function signatureMatches(body: string, signature: string, secret: string) {
  const expected = Buffer.from(sign(body, secret));
  const provided = Buffer.from(signature);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function encodePayload(payload: VerifiedGuildPayload, secret: string) {
  const body = base64Url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

function decodePayload(value: string | undefined, userId: string | null | undefined): VerifiedGuildPayload | null {
  if (!value || !userId) {
    return null;
  }

  const secret = getSecret();
  if (!secret) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [body, signature] = parts;
  if (!body || !signature || !signatureMatches(body, signature, secret)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<VerifiedGuildPayload>;
    if (
      payload.userId !== userId
      || !Array.isArray(payload.guilds)
      || typeof payload.expiresAt !== "number"
      || payload.expiresAt < Date.now()
    ) {
      return null;
    }
    return payload as VerifiedGuildPayload;
  } catch {
    return null;
  }
}

// The cookie only vouches for the user it was issued to (userId is part of the signed payload).
export function createVerifiedGuildsCookie(guilds: DashboardGuildSummary[], userId: string | null | undefined) {
  const secret = getSecret();
  if (!secret || !userId) {
    return null;
  }

  return {
    name: COOKIE_NAME,
    value: encodePayload(
      {
        expiresAt: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000,
        userId,
        guilds
      },
      secret
    ),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS
    }
  };
}

export function readVerifiedGuildsFromCookieValue(value: string | undefined, userId: string | null | undefined) {
  return decodePayload(value, userId)?.guilds ?? [];
}

export async function readVerifiedGuildsCookie(userId: string | null | undefined) {
  const store = await cookies();
  return readVerifiedGuildsFromCookieValue(store.get(COOKIE_NAME)?.value, userId);
}
