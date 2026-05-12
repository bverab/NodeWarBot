import type { EventMutationInput, RoleSlotMutationInput, TemplateMutationInput } from "@/lib/server/dashboardData";
import { buildEventDateTime, normalizeTimezoneInfo } from "@/lib/eventDateTime";

export const PUBLISHED_EVENT_LOCKED_FIELDS = [
  "eventType",
  "time",
  "timezone",
  "duration",
  "closeBeforeMinutes",
  "autoPublishEnabled",
  "scheduledPublishAt",
  "publishBeforeMinutes",
  "publishError",
  "lastPublishAttemptAt",
  "closesAt",
  "expiresAt",
  "channelId",
  "messageId"
] as const;

export function getLockedPublishedEventPatchFields(body: Record<string, unknown>) {
  return PUBLISHED_EVENT_LOCKED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
}

export function parseOptionalDate(value: unknown, timezone?: string | null) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const localMatch = value.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{1,2}:\d{2})$/);
  if (localMatch && timezone) {
    return buildEventDateTime({ date: localMatch[1], time: localMatch[2], timezone: normalizeTimezoneInfo(timezone).timezone });
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : "";
}

export function readNullableString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function readNumber(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;

  if (!Number.isFinite(number)) {
    return undefined;
  }

  return Math.min(max, Math.max(min, Math.trunc(number)));
}

export function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function readTime(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = normalizeTimeInput(value);
  if (normalized === undefined) {
    return null;
  }

  return normalized ?? "INVALID";
}

export function normalizeTimeInput(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

export function parseEventPatch(body: Record<string, unknown>, options: { timezone?: string | null } = {}) {
  const patch: EventMutationInput = {};

  const name = readString(body.name, 120);
  if (name !== undefined) {
    if (name.length < 2) {
      return { error: "Event name must be between 2 and 120 characters." } as const;
    }
    patch.name = name;
  }

  for (const [key, max] of [
    ["eventType", 32],
    ["type", 64]
  ] as const) {
    const value = readString(body[key], max);
    if (value !== undefined) {
      if (!value) {
        return { error: `${key} cannot be empty.` } as const;
      }
      patch[key] = value;
    }
  }

  const timezone = readString(body.timezone, 64);
  if (timezone !== undefined) {
    const timezoneInfo = normalizeTimezoneInfo(timezone);
    if (timezoneInfo.source === "fallback" && timezone.trim()) {
      return { error: "Timezone must be a valid IANA timezone." } as const;
    }
    patch.timezone = timezoneInfo.timezone;
  }

  const time = readTime(body.time);
  if (time === "INVALID") {
    return { error: "Time must use HH:mm format." } as const;
  }
  if (time !== undefined) {
    patch.time = time;
  }

  const duration = readNumber(body.duration, 1, 1440);
  if (duration !== undefined) {
    patch.duration = duration;
  }

  const closeBeforeMinutes = readNumber(body.closeBeforeMinutes, 0, 1440);
  if (closeBeforeMinutes !== undefined) {
    patch.closeBeforeMinutes = closeBeforeMinutes;
  }

  const autoPublishEnabled = readBoolean(body.autoPublishEnabled);
  if (autoPublishEnabled !== undefined) {
    patch.autoPublishEnabled = autoPublishEnabled;
  }

  const isClosed = readBoolean(body.isClosed);
  if (isClosed !== undefined) {
    patch.isClosed = isClosed;
  }

  const channelId = readNullableString(body.channelId, 32);
  if (channelId !== undefined) {
    patch.channelId = channelId;
  }

  const messageId = readNullableString(body.messageId, 32);
  if (messageId !== undefined) {
    patch.messageId = messageId;
  }

  const patchTimezone = typeof patch.timezone === "string" ? patch.timezone : normalizeTimezoneInfo(options.timezone).timezone;
  const closesAt = parseOptionalDate(body.closesAt, patchTimezone);
  if (closesAt === null) {
    return { error: "Invalid closesAt date." } as const;
  }
  if (closesAt) {
    patch.closesAt = closesAt;
  }

  const expiresAt = parseOptionalDate(body.expiresAt, patchTimezone);
  if (expiresAt === null) {
    return { error: "Invalid expiresAt date." } as const;
  }
  if (expiresAt) {
    patch.expiresAt = expiresAt;
  }

  return { patch } as const;
}

export function parseTemplatePatch(body: Record<string, unknown>) {
  const patch: TemplateMutationInput = {};

  const name = readString(body.name, 120);
  if (name !== undefined) {
    if (name.length < 2) {
      return { error: "Template name must be between 2 and 120 characters." } as const;
    }
    patch.name = name;
  }

  for (const [key, max] of [
    ["eventType", 32],
    ["typeDefault", 64]
  ] as const) {
    const value = readString(body[key], max);
    if (value !== undefined) {
      if (!value) {
        return { error: `${key} cannot be empty.` } as const;
      }
      patch[key] = value;
    }
  }

  const timezone = readString(body.timezone, 64);
  if (timezone !== undefined) {
    const timezoneInfo = normalizeTimezoneInfo(timezone);
    if (timezoneInfo.source === "fallback" && timezone.trim()) {
      return { error: "Timezone must be a valid IANA timezone." } as const;
    }
    patch.timezone = timezoneInfo.timezone;
  }

  const time = readTime(body.time);
  if (time === "INVALID") {
    return { error: "Time must use HH:mm format." } as const;
  }
  if (time !== undefined) {
    patch.time = time;
  }

  const duration = readNumber(body.duration, 1, 1440);
  if (duration !== undefined) {
    patch.duration = duration;
  }

  const closeBeforeMinutes = readNumber(body.closeBeforeMinutes, 0, 1440);
  if (closeBeforeMinutes !== undefined) {
    patch.closeBeforeMinutes = closeBeforeMinutes;
  }

  const isArchived = readBoolean(body.isArchived);
  if (isArchived !== undefined) {
    patch.isArchived = isArchived;
  }

  return { patch } as const;
}

export function parseRoleSlotPatch(body: Record<string, unknown>, requireNameAndMax = false) {
  const patch: RoleSlotMutationInput = {};

  const name = readString(body.name, 80);
  if (name !== undefined) {
    if (name.length < 1) {
      return { error: "Slot name cannot be empty." } as const;
    }
    patch.name = name;
  }

  const max = readNumber(body.max, 1, 100);
  if (max !== undefined) {
    patch.max = max;
  }

  const position = readNumber(body.position, 0, 999);
  if (position !== undefined) {
    patch.position = position;
  }

  const emoji = readNullableString(body.emoji, 128);
  if (emoji !== undefined) {
    patch.emoji = emoji;
  }

  const emojiSource = readNullableString(body.emojiSource, 64);
  if (emojiSource !== undefined) {
    patch.emojiSource = emojiSource;
  }

  if (Array.isArray(body.allowedRoleIds)) {
    const roleIds = body.allowedRoleIds
      .map((roleId) => (typeof roleId === "string" ? roleId.trim() : ""))
      .filter(Boolean);
    if (roleIds.some((roleId) => !/^\d{5,32}$/.test(roleId))) {
      return { error: "Allowed role IDs must be valid Discord role IDs." } as const;
    }
    patch.allowedRoleIds = Array.from(new Set(roleIds)).slice(0, 25);
  }

  if (requireNameAndMax && (!patch.name || !patch.max)) {
    return { error: "Slot name and capacity are required." } as const;
  }

  return { patch } as const;
}
