import { z } from "zod";
import { buildEventDateTime, calculateScheduledPublishAt, normalizeTimezoneInfo } from "@/lib/eventDateTime";

const timeSchema = z.string().regex(/^\d{1,2}:\d{2}$/).refine((value) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}, "Time must use HH:mm format.");

const timezoneSchema = z.string().min(1).max(64).superRefine((value, context) => {
  const timezoneInfo = normalizeTimezoneInfo(value);
  if (timezoneInfo.source === "fallback" && value.trim()) {
    context.addIssue({ code: "custom", message: "Timezone must be a valid IANA timezone." });
  }
}).transform((value) => normalizeTimezoneInfo(value).timezone);

export const createEventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  eventType: z.enum(["war", "siege", "pve", "10v10"]),
  type: z.string().trim().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: timeSchema,
  timezone: timezoneSchema,
  duration: z.coerce.number().int().min(1).max(1440),
  closeBeforeMinutes: z.coerce.number().int().min(0).max(1440),
  channelId: z.string().trim().regex(/^\d{5,32}$/).nullable().optional(),
  autoPublishEnabled: z.boolean().optional().default(false),
  publishBeforeMinutes: z.coerce.number().int().min(0).max(10080).optional().default(60),
  accessRoleIds: z.array(z.string().trim().regex(/^\d{5,32}$/)).max(25).optional(),
  notifyRoleIds: z.array(z.string().trim().regex(/^\d{5,32}$/)).max(25).optional(),
  recurrence: z.enum(["single", "weekly"]).optional(),
  recap: z.object({
    enabled: z.boolean(),
    minutesBeforeExpire: z.coerce.number().int().min(0).max(1440),
    messageText: z.string().trim().max(1000)
  }).optional(),
  pveOptions: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        time: timeSchema,
        capacity: z.coerce.number().int().min(1).max(100),
        position: z.coerce.number().int().min(0).max(999).optional()
      })
    )
    .max(30)
    .optional(),
  templateId: z.string().trim().min(1).max(128).optional(),
  slots: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        max: z.coerce.number().int().min(1).max(100),
        position: z.coerce.number().int().min(0).max(999).optional(),
        emoji: z.string().trim().max(128).nullable().optional(),
        emojiSource: z.string().trim().max(64).nullable().optional(),
        allowedRoleIds: z.array(z.string().trim().regex(/^\d{5,32}$/)).max(25).optional()
      })
    )
    .max(100)
    .optional()
}).superRefine((value, context) => {
  const startsAt = buildEventDateTime({ date: value.date, time: value.time, timezone: value.timezone });
  if (!startsAt) {
    context.addIssue({ code: "custom", path: ["date"], message: "Date, time, and timezone must describe a valid event start." });
  }

  if (value.autoPublishEnabled) {
    if (!value.channelId) {
      context.addIssue({ code: "custom", path: ["channelId"], message: "Select a Discord channel before enabling scheduled publish." });
    }
    if (startsAt && !calculateScheduledPublishAt({ startsAt, publishBeforeMinutes: value.publishBeforeMinutes })) {
      context.addIssue({ code: "custom", path: ["publishBeforeMinutes"], message: "Scheduled publish time could not be calculated." });
    }
  }

  if (value.eventType === "pve" && !value.templateId && !value.pveOptions?.length) {
    context.addIssue({ code: "custom", path: ["pveOptions"], message: "Add at least one PvE time option." });
  }

  if (value.eventType !== "pve" && !value.templateId && !value.slots?.length) {
    context.addIssue({ code: "custom", path: ["slots"], message: "Select a template or add at least one manual slot." });
  }

  if (value.closeBeforeMinutes > value.duration) {
    context.addIssue({ code: "custom", path: ["closeBeforeMinutes"], message: "Close before expiry cannot exceed duration." });
  }

  if (value.slots?.length) {
    const names = value.slots.map((slot) => slot.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: "custom", path: ["slots"], message: "Slot names must be unique." });
    }
  }

  if (value.pveOptions?.length) {
    const times = value.pveOptions.map((option) => option.time);
    if (new Set(times).size !== times.length) {
      context.addIssue({ code: "custom", path: ["pveOptions"], message: "PvE option times must be unique." });
    }
  }
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

export function formatCreateEventIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}
