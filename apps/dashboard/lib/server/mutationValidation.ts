import type { EventMutationInput, RoleSlotMutationInput, TemplateMutationInput } from "@/lib/server/dashboardData";

export function parseOptionalDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
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

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return /^\d{1,2}:\d{2}$/.test(trimmed) ? trimmed : "INVALID";
}

export function parseEventPatch(body: Record<string, unknown>) {
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
    ["type", 64],
    ["timezone", 64]
  ] as const) {
    const value = readString(body[key], max);
    if (value !== undefined) {
      if (!value) {
        return { error: `${key} cannot be empty.` } as const;
      }
      patch[key] = value;
    }
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

  const closesAt = parseOptionalDate(body.closesAt);
  if (closesAt === null) {
    return { error: "Invalid closesAt date." } as const;
  }
  if (closesAt) {
    patch.closesAt = closesAt;
  }

  const expiresAt = parseOptionalDate(body.expiresAt);
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
    ["typeDefault", 64],
    ["timezone", 64]
  ] as const) {
    const value = readString(body[key], max);
    if (value !== undefined) {
      if (!value) {
        return { error: `${key} cannot be empty.` } as const;
      }
      patch[key] = value;
    }
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

  if (requireNameAndMax && (!patch.name || !patch.max)) {
    return { error: "Slot name and capacity are required." } as const;
  }

  return { patch } as const;
}
