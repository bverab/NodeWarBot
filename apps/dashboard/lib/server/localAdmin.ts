import "server-only";
import crypto from "node:crypto";
import type { Session } from "next-auth";

// Optional username/password sign-in for local testing without Discord OAuth. It is enabled only when
// DASHBOARD_ADMIN_USERNAME and DASHBOARD_ADMIN_PASSWORD_HASH are set, and never in production builds.
export const LOCAL_ADMIN_PROVIDER_ID = "local-admin";
export const LOCAL_ADMIN_USER_ID = "local-admin";

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;

type ParsedHash = { salt: Buffer; hash: Buffer };

// Format: scrypt:<salt base64url>:<hash base64url>. Generate it with `pnpm dashboard:admin-password`.
// ":" and not "$" as separator: Next.js expands $NAME inside .env files, which would corrupt the hash.
export function hashLocalAdminPassword(password: string, salt = crypto.randomBytes(SCRYPT_SALT_BYTES)) {
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

function parseHash(value: string | undefined): ParsedHash | null {
  const parts = (value ?? "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt" || !parts[1] || !parts[2]) {
    return null;
  }

  const salt = Buffer.from(parts[1], "base64url");
  const hash = Buffer.from(parts[2], "base64url");
  return salt.length > 0 && hash.length === SCRYPT_KEY_LENGTH ? { salt, hash } : null;
}

function getConfig() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const username = process.env.DASHBOARD_ADMIN_USERNAME?.trim();
  const parsed = parseHash(process.env.DASHBOARD_ADMIN_PASSWORD_HASH?.trim());
  return username && parsed ? { username, ...parsed } : null;
}

export function isLocalAdminEnabled() {
  return getConfig() !== null;
}

function sameText(a: string, b: string) {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

export function verifyLocalAdminCredentials(username: unknown, password: unknown) {
  const config = getConfig();
  if (!config || typeof username !== "string" || typeof password !== "string") {
    return false;
  }

  const candidate = crypto.scryptSync(password, config.salt, SCRYPT_KEY_LENGTH);
  const passwordMatches = crypto.timingSafeEqual(candidate, config.hash);
  return sameText(username.trim(), config.username) && passwordMatches;
}

export function isLocalAdminSession(session: Session | null | undefined) {
  return Boolean(
    session
    && session.provider === LOCAL_ADMIN_PROVIDER_ID
    && session.user?.id === LOCAL_ADMIN_USER_ID
    && isLocalAdminEnabled()
  );
}
