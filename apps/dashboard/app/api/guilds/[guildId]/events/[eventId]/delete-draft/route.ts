import { NextResponse } from "next/server";
import { deleteGuildDraftEvent } from "@/lib/server/dashboardData";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const result = await deleteGuildDraftEvent(guildId, eventId);

    if (result.status === "not_found") {
      return NextResponse.json({ error: "Event not found for this guild." }, { status: 404 });
    }

    if (result.status === "not_draft") {
      return NextResponse.json(
        { error: "Only database-only drafts without Discord publication metadata can be deleted." },
        { status: 409 }
      );
    }

    return NextResponse.json({ status: "deleted" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to delete draft event." }, { status: 500 });
  }
}
