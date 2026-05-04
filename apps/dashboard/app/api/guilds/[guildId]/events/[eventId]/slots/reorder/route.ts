import { NextResponse } from "next/server";
import { reorderGuildEventRoleSlots } from "@/lib/server/dashboardData";
import { requireManageableDashboardGuild } from "@/lib/server/guildAccess";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string }>;
};

function parseSlots(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map((slot) => {
    if (!slot || typeof slot !== "object") {
      return null;
    }

    const candidate = slot as { id?: unknown; order?: unknown };
    const order = typeof candidate.order === "number" ? candidate.order : Number(candidate.order);

    if (typeof candidate.id !== "string" || !candidate.id || !Number.isFinite(order)) {
      return null;
    }

    return {
      id: candidate.id,
      order: Math.max(1, Math.trunc(order))
    };
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const body = (await request.json()) as { slots?: unknown };
    const parsed = parseSlots(body.slots);

    if (!parsed || parsed.some((slot) => slot === null)) {
      return NextResponse.json({ error: "Invalid slot order payload." }, { status: 400 });
    }

    const slots = parsed as Array<{ id: string; order: number }>;
    const event = await reorderGuildEventRoleSlots(guildId, eventId, slots);
    if (!event) {
      return NextResponse.json({ error: "One or more slots were not found for this guild event." }, { status: 404 });
    }

    if ("error" in event) {
      return NextResponse.json({ error: event.error }, { status: 400 });
    }

    return NextResponse.json({ event, sync: "discord_sync_pending" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to reorder event slots." }, { status: 500 });
  }
}
