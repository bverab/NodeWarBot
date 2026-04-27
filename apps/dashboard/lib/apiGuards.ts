import type { Session } from "next-auth";
import { NextResponse } from "next/server";

export function requireSession(session: Session | null): NextResponse | null {
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function getSessionUserId(session: Session): string | null {
  const userId = session.user?.id;
  if (!userId || typeof userId !== "string") {
    return null;
  }
  return userId;
}

/**
 * Placeholder helper. This does NOT perform full guild admin verification.
 *
 * Current behavior:
 * - only checks that both IDs are present.
 *
 * Production requirement:
 * - validate membership and admin/manage permissions against trusted Discord data,
 *   typically by combining OAuth guild scopes with bot-side guild/member checks.
 */
export async function requireGuildAdmin(
  sessionUserId: string,
  guildId: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!sessionUserId || !guildId) {
    return { allowed: false, reason: "Missing user or guild ID." };
  }

  return {
    allowed: false,
    reason: "Guild admin validation is not implemented; do not trust this in production."
  };
}
