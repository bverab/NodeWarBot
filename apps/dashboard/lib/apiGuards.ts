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
