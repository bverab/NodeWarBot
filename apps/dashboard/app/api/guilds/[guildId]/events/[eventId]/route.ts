import { NextResponse } from "next/server";
import { calculateEventLifecycleDates, calculateScheduledPublishAt, formatDateTimeInTimezone, normalizeTimezoneInfo } from "@/lib/eventDateTime";
import { getGuildEventDetail, updateGuildEvent } from "@/lib/server/dashboardData";
import { requireDashboardGuild, requireManageableDashboardGuild } from "@/lib/server/guildAccess";
import { prisma } from "@/lib/server/prisma";
import { getLockedPublishedEventPatchFields, parseEventPatch, readNumber } from "@/lib/server/mutationValidation";

type RouteContext = {
  params: Promise<{ guildId: string; eventId: string }>;
};

function localDateForCurrentEventStart(event: { expiresAt: Date; duration: number; timezone: string }) {
  const safeTimezone = normalizeTimezoneInfo(event.timezone).timezone;
  const startsAt = new Date(event.expiresAt.getTime() - event.duration * 60_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(startsAt);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function hasSchedulePatch(body: Record<string, unknown>) {
  return ["time", "timezone", "duration", "closeBeforeMinutes"].some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

function hasScheduledPublishPatch(body: Record<string, unknown>) {
  return ["autoPublishEnabled", "publishBeforeMinutes", "scheduledPublishAt"].some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

function getStartsAtFromLifecycleFields(event: { expiresAt: Date; duration: number }) {
  return new Date(event.expiresAt.getTime() - event.duration * 60_000);
}

function logEventEdit(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn("[dashboard:event-edit]", message, details);
}

function validationResponse(error: string, issues: Array<{ path: string; message: string }>, status = 400) {
  return NextResponse.json({ ok: false, error, issues }, { status });
}

function sanitizeEventEditBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return { ...(value as Record<string, unknown>) };
}

function readRecurrenceScope(body: Record<string, unknown>) {
  return body.recurrenceScope === "series" ? "series" : "single";
}

function serializePatchValue(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function GET(_request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const event = await getGuildEventDetail(guildId, eventId);

    if (!event) {
      return NextResponse.json({ error: "Event not found for this guild." }, { status: 404 });
    }

    return NextResponse.json({ guild: access.activeGuild, event }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to load event details." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { guildId, eventId } = await context.params;
  const access = await requireManageableDashboardGuild(guildId);

  if ("error" in access) {
    return access.error;
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const body = sanitizeEventEditBody(rawBody);

    logEventEdit("incoming patch", {
      guildId,
      eventId,
      body
    });

    if (!body) {
      return validationResponse("Invalid request body.", [{ path: "body", message: "Expected a JSON object." }]);
    }
    const recurrenceScope = readRecurrenceScope(body);
    delete body.recurrenceScope;

    const current = await prisma.event.findFirst({
      where: { id: eventId, guildId },
      select: {
        id: true,
        groupId: true,
        messageId: true,
        time: true,
        timezone: true,
        duration: true,
        closeBeforeMinutes: true,
        autoPublishEnabled: true,
        scheduledPublishAt: true,
        channelId: true,
        expiresAt: true,
        schedule: {
          select: {
            enabled: true,
            mode: true
          }
        }
      }
    });

    if (!current) {
      return validationResponse("Event not found for this guild.", [{ path: "eventId", message: "Event does not belong to this guild." }], 404);
    }
    const isRecurringSeriesEvent = current.schedule?.mode === "recurring" && Boolean(current.groupId);
    const applyToSeries = recurrenceScope === "series" && isRecurringSeriesEvent;
    const seriesTargets = applyToSeries
      ? await prisma.event.findMany({
          where: { guildId, groupId: current.groupId },
          select: {
            id: true,
            messageId: true,
            time: true,
            timezone: true,
            duration: true,
            closeBeforeMinutes: true,
            autoPublishEnabled: true,
            scheduledPublishAt: true,
            channelId: true,
            expiresAt: true
          }
        })
      : [];

    if (current.messageId) {
      const attemptedLockedFields = getLockedPublishedEventPatchFields(body);
      if (attemptedLockedFields.length) {
        logEventEdit("blocked published event fields", {
          guildId,
          eventId,
          attemptedLockedFields
        });

        return validationResponse(
          "Schedule and Discord publication fields are locked after publishing.",
          attemptedLockedFields.map((field) => ({ path: field, message: "Locked after publishing." })),
          409
        );
      }
    }
    if (applyToSeries) {
      const attemptedLockedFields = getLockedPublishedEventPatchFields(body);
      const publishedTarget = seriesTargets.find((target) => target.messageId);
      if (publishedTarget && attemptedLockedFields.length) {
        return validationResponse(
          "Schedule and Discord publication fields are locked for published occurrences in this series.",
          attemptedLockedFields.map((field) => ({ path: field, message: "Locked on at least one published occurrence." })),
          409
        );
      }
    }

    delete body.closesAt;
    delete body.expiresAt;
    const result = parseEventPatch(body, { timezone: current.timezone });
    if ("error" in result) {
      const validationError = result.error ?? "Invalid event update payload.";
      logEventEdit("validation failed", {
        guildId,
        eventId,
        error: validationError,
        body
      });

      return validationResponse(validationError, [{ path: "payload", message: validationError }]);
    }
    const { patch } = result;
    const currentTimezoneInfo = normalizeTimezoneInfo(current.timezone);
    if (currentTimezoneInfo.source === "alias") {
      logEventEdit("normalized stored timezone alias", {
        guildId,
        eventId,
        from: current.timezone,
        to: currentTimezoneInfo.timezone
      });
      patch.timezone ??= currentTimezoneInfo.timezone;
    }

    let nextStartsAt = getStartsAtFromLifecycleFields(current);
    if (!current.messageId && hasSchedulePatch(body)) {
      const nextTimezone = patch.timezone ?? currentTimezoneInfo.timezone;
      const nextDuration = patch.duration ?? current.duration;
      const nextCloseBeforeMinutes = patch.closeBeforeMinutes ?? current.closeBeforeMinutes;
      const nextTime = patch.time ?? current.time;
      if (!nextTime) {
        return validationResponse("Event start time is required to recalculate lifecycle dates.", [
          { path: "time", message: "Event start time is required to recalculate lifecycle dates." }
        ]);
      }

      const lifecycleDate = localDateForCurrentEventStart({ ...current, timezone: nextTimezone });
      const lifecycle = calculateEventLifecycleDates({
        date: lifecycleDate,
        time: nextTime,
        timezone: nextTimezone,
        duration: nextDuration,
        closeBeforeMinutes: nextCloseBeforeMinutes
      });
      if (!lifecycle) {
        logEventEdit("lifecycle recalculation failed", {
          guildId,
          eventId,
          date: lifecycleDate,
          time: nextTime,
          timezone: nextTimezone,
          duration: nextDuration,
          closeBeforeMinutes: nextCloseBeforeMinutes
        });

        return validationResponse("Event schedule could not be recalculated.", [
          { path: "schedule", message: "Check start time, timezone, duration and close-before-end values." }
        ]);
      }

      patch.closesAt = lifecycle.closesAt;
      patch.expiresAt = lifecycle.expiresAt;
      nextStartsAt = lifecycle.startsAt;

      logEventEdit("lifecycle recalculated", {
        guildId,
        eventId,
        date: lifecycleDate,
        time: nextTime,
        timezone: nextTimezone,
        duration: nextDuration,
        closeBeforeMinutes: nextCloseBeforeMinutes,
        startsAtUtc: lifecycle.startsAt.toISOString(),
        startsAtLocal: formatDateTimeInTimezone(lifecycle.startsAt, nextTimezone),
        closesAtLocal: formatDateTimeInTimezone(lifecycle.closesAt, nextTimezone),
        expiresAtLocal: formatDateTimeInTimezone(lifecycle.expiresAt, nextTimezone)
      });
    }

    if (!current.messageId && (hasScheduledPublishPatch(body) || (patch.autoPublishEnabled ?? current.autoPublishEnabled))) {
      const nextAutoPublishEnabled = patch.autoPublishEnabled ?? current.autoPublishEnabled;
      const publishBeforeMinutes = readNumber(body.publishBeforeMinutes, 0, 10080);

      if (Object.prototype.hasOwnProperty.call(body, "publishBeforeMinutes") && publishBeforeMinutes === undefined) {
        return validationResponse("Publish-before minutes must be a valid whole number.", [
          { path: "publishBeforeMinutes", message: "Publish-before minutes must be a valid whole number." }
        ]);
      }

      if (nextAutoPublishEnabled && !((patch.channelId ?? current.channelId) || null)) {
        return validationResponse("Select a Discord channel before enabling scheduled publish.", [
          { path: "channelId", message: "Select a Discord channel before enabling scheduled publish." }
        ]);
      }

      patch.autoPublishEnabled = nextAutoPublishEnabled;
      patch.publishError = null;
      patch.lastPublishAttemptAt = null;
      patch.scheduledPublishAt = nextAutoPublishEnabled
        ? calculateScheduledPublishAt({
            startsAt: nextStartsAt,
            publishBeforeMinutes: publishBeforeMinutes ?? (
              current.scheduledPublishAt
                ? Math.max(0, Math.round((nextStartsAt.getTime() - current.scheduledPublishAt.getTime()) / 60_000))
                : 60
            )
          })
        : null;

      if (nextAutoPublishEnabled && !patch.scheduledPublishAt) {
        return validationResponse("Scheduled publish time could not be calculated.", [
          { path: "publishBeforeMinutes", message: "Scheduled publish time could not be calculated." }
        ]);
      }

      logEventEdit("scheduled publish normalized", {
        guildId,
        eventId,
        autoPublishEnabled: patch.autoPublishEnabled,
        publishBeforeMinutes: publishBeforeMinutes ?? null,
        scheduledPublishAt: patch.scheduledPublishAt?.toISOString() ?? null,
        scheduledPublishAtLocal: patch.scheduledPublishAt
          ? formatDateTimeInTimezone(patch.scheduledPublishAt, patch.timezone ?? currentTimezoneInfo.timezone)
          : null
      });
    }

    if (!Object.keys(patch).length) {
      return validationResponse("No supported fields were provided.", [
        { path: "payload", message: "No supported fields were provided." }
      ]);
    }

    logEventEdit("normalized patch", {
      guildId,
      eventId,
      recurrenceScope: applyToSeries ? "series" : "single",
      patch: Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, serializePatchValue(value)]))
    });

    if (applyToSeries) {
      await prisma.$transaction(
        seriesTargets.map((target) => {
          const targetPatch = { ...patch };
          let targetStartsAt = getStartsAtFromLifecycleFields(target);
          if (!target.messageId && hasSchedulePatch(body)) {
            const nextTimezone = targetPatch.timezone ?? normalizeTimezoneInfo(target.timezone).timezone;
            const nextDuration = targetPatch.duration ?? target.duration;
            const nextCloseBeforeMinutes = targetPatch.closeBeforeMinutes ?? target.closeBeforeMinutes;
            const nextTime = targetPatch.time ?? target.time;
            if (nextTime) {
              const lifecycleDate = localDateForCurrentEventStart({ ...target, timezone: nextTimezone });
              const lifecycle = calculateEventLifecycleDates({
                date: lifecycleDate,
                time: nextTime,
                timezone: nextTimezone,
                duration: nextDuration,
                closeBeforeMinutes: nextCloseBeforeMinutes
              });
              if (lifecycle) {
                targetPatch.closesAt = lifecycle.closesAt;
                targetPatch.expiresAt = lifecycle.expiresAt;
                targetStartsAt = lifecycle.startsAt;
              }
            }
          }

          if (!target.messageId && (hasScheduledPublishPatch(body) || (targetPatch.autoPublishEnabled ?? target.autoPublishEnabled))) {
            const nextAutoPublishEnabled = targetPatch.autoPublishEnabled ?? target.autoPublishEnabled;
            targetPatch.autoPublishEnabled = nextAutoPublishEnabled;
            targetPatch.publishError = null;
            targetPatch.lastPublishAttemptAt = null;
            targetPatch.scheduledPublishAt = nextAutoPublishEnabled
              ? calculateScheduledPublishAt({
                  startsAt: targetStartsAt,
                  publishBeforeMinutes: readNumber(body.publishBeforeMinutes, 0, 10080) ?? (
                    target.scheduledPublishAt
                      ? Math.max(0, Math.round((targetStartsAt.getTime() - target.scheduledPublishAt.getTime()) / 60_000))
                      : 60
                  )
                })
              : null;
          }

          return prisma.event.update({
            where: { id: target.id },
            data: targetPatch
          });
        })
      );
    } else {
      await updateGuildEvent(guildId, eventId, patch);
    }

    const event = await getGuildEventDetail(guildId, eventId);

    return NextResponse.json({ event, sync: "discord_sync_pending" }, { status: 200 });
  } catch (error) {
    logEventEdit("patch failed", {
      guildId,
      eventId,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : undefined,
      meta: typeof error === "object" && error && "meta" in error ? (error as { meta?: unknown }).meta : undefined
    });

    return NextResponse.json(
      { ok: false, error: "Failed to update event.", issues: [{ path: "server", message: "The event update could not be completed." }] },
      { status: 500 }
    );
  }
}
