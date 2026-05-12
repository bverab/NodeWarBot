import "server-only";
import crypto from "node:crypto";
import type { Event, EventEnrollment, EventFillerEntry, EventParticipant, EventRoleSlot, EventSchedule, EventWaitlistEntry } from "@prisma/client";
import { calculateEventLifecycleDates, calculateScheduledPublishAt, normalizeTimezone } from "@/lib/eventDateTime";
import { fetchDiscordGuildMembers } from "@/lib/server/discordMembers";
import { prisma } from "@/lib/server/prisma";

export type EventListItem = {
  id: string;
  name: string;
  eventType: string;
  type: string;
  status: "draft" | "open" | "closed" | "expired";
  published: boolean;
  groupId: string | null;
  dayOfWeek: number | null;
  recurrenceMode: "once" | "recurring";
  isRecurring: boolean;
  time: string | null;
  timezone: string;
  autoPublishEnabled: boolean;
  scheduledPublishAt: string | null;
  publishError: string | null;
  lastPublishAttemptAt: string | null;
  createdAt: string;
  closesAt: string;
  expiresAt: string;
  participantCount: number;
  waitlistCount: number;
  fillerCount: number;
  channelId: string | null;
  messageId: string | null;
};

export type EventDetail = EventListItem & {
  creatorId: string | null;
  duration: number;
  closeBeforeMinutes: number;
  roleSlots: Array<{
    id: string;
    name: string;
    max: number;
    position: number;
    emoji: string | null;
    emojiSource: string | null;
    allowedRoleIds: string[];
    permissions: Array<{
      discordRoleId: string | null;
      discordRoleName: string | null;
    }>;
    participants: Array<{
      id: string;
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      className: string | null;
      spec: string | null;
      gearScore: number | null;
      isFake: boolean;
      joinedAt: string;
    }>;
  }>;
  enrollments: Array<{
    id: string;
    optionId: string;
    optionLabel: string;
    optionTime: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    className: string | null;
    spec: string | null;
    gearScore: number | null;
    enrollmentType: string;
    isFake: boolean;
    joinedAt: string;
  }>;
  options: Array<{
    id: string;
    label: string;
    time: string;
    capacity: number;
    position: number;
  }>;
  waitlist: Array<{
    id: string;
    position: number;
    userId: string;
    userName: string;
    avatarUrl: string | null;
    className: string | null;
    spec: string | null;
    gearScore: number | null;
    roleName: string | null;
    isFake: boolean;
    joinedAt: string;
  }>;
  fillers: Array<{
    id: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    className: string | null;
    spec: string | null;
    gearScore: number | null;
    isFake: boolean;
    joinedAt: string;
  }>;
  discordUrl: string | null;
};

export type EventMutationInput = {
  name?: string;
  eventType?: string;
  type?: string;
  time?: string | null;
  timezone?: string;
  duration?: number;
  closeBeforeMinutes?: number;
  autoPublishEnabled?: boolean;
  scheduledPublishAt?: Date | null;
  publishError?: string | null;
  lastPublishAttemptAt?: Date | null;
  closesAt?: Date;
  expiresAt?: Date;
  isClosed?: boolean;
  channelId?: string | null;
  messageId?: string | null;
};

export type CreateGuildEventInput = {
  name: string;
  eventType: string;
  type: string;
  date: string;
  time: string;
  timezone: string;
  duration: number;
  closeBeforeMinutes: number;
  channelId?: string | null;
  accessRoleIds?: string[];
  notifyRoleIds?: string[];
  recurrence?: "single" | "weekly";
  autoPublishEnabled?: boolean;
  publishBeforeMinutes?: number;
  recap?: {
    enabled: boolean;
    minutesBeforeExpire: number;
    messageText: string;
  };
  pveOptions?: Array<{
    label: string;
    time: string;
    capacity: number;
    position?: number;
  }>;
  templateId?: string;
  slots?: Array<{
    name: string;
    max: number;
    position?: number;
    emoji?: string | null;
    emojiSource?: string | null;
    allowedRoleIds?: string[];
  }>;
};

export type RoleSlotMutationInput = {
  name?: string;
  max?: number;
  position?: number;
  emoji?: string | null;
  emojiSource?: string | null;
  allowedRoleIds?: string[];
};

export type TemplateMutationInput = {
  name?: string;
  eventType?: string;
  typeDefault?: string;
  time?: string | null;
  timezone?: string;
  duration?: number;
  closeBeforeMinutes?: number;
  isArchived?: boolean;
};

export type CreateGuildTemplateInput = {
  name: string;
  eventType: string;
  typeDefault: string;
  timezone: string;
  time?: string | null;
  slots: Array<{
    name: string;
    max: number;
    position?: number;
    emoji?: string | null;
    emojiSource?: string | null;
    allowedRoleIds?: string[];
  }>;
};

export type OverviewData = {
  activeEvents: number;
  upcomingEvents: number;
  totalEvents: number;
  totalParticipants: number;
  scheduledEvents: number;
  templates: number;
  garmothProfiles: number;
  recentEvents: EventListItem[];
};

function toIso(value: Date) {
  return value.toISOString();
}

function getEventStatus(event: Pick<Event, "isClosed" | "expiresAt" | "closesAt" | "channelId" | "messageId">): EventListItem["status"] {
  if (!event.messageId) {
    return "draft";
  }

  if (event.isClosed) {
    return "closed";
  }

  return event.expiresAt.getTime() < Date.now() || event.closesAt.getTime() < Date.now() ? "expired" : "open";
}

export function isEventPublishedForDashboard(event: Pick<Event, "messageId">) {
  return Boolean(event.messageId);
}

export function canDeleteEventPermanently(event: Pick<Event, "messageId">) {
  return !isEventPublishedForDashboard(event);
}

function isFillerEnrollment(enrollment: Pick<EventEnrollment, "enrollmentType">) {
  return String(enrollment.enrollmentType || "PRIMARY").toUpperCase() === "FILLER";
}

function countParticipants(event: {
  participants?: unknown[];
  enrollments?: EventEnrollment[];
}) {
  return (event.participants?.length ?? 0) + (event.enrollments?.filter((enrollment) => !isFillerEnrollment(enrollment)).length ?? 0);
}

function countFillers(event: {
  enrollments?: EventEnrollment[];
  fillers?: EventFillerEntry[];
}) {
  return (event.fillers?.length ?? 0) + (event.enrollments?.filter(isFillerEnrollment).length ?? 0);
}

function toEventListItem(
  event: Event & {
    schedule?: EventSchedule | null;
    participants?: EventParticipant[];
    enrollments?: EventEnrollment[];
    waitlist?: EventWaitlistEntry[];
    fillers?: EventFillerEntry[];
  }
): EventListItem {
  return {
    id: event.id,
    name: event.name,
    eventType: event.eventType,
    type: event.type,
    status: getEventStatus(event),
    published: isEventPublishedForDashboard(event),
    groupId: event.groupId,
    dayOfWeek: event.dayOfWeek,
    recurrenceMode: event.schedule?.mode === "recurring" ? "recurring" : "once",
    isRecurring: event.schedule?.mode === "recurring" && (Boolean(event.groupId) || Boolean(event.schedule.enabled)),
    time: event.time,
    timezone: normalizeTimezone(event.timezone),
    autoPublishEnabled: Boolean(event.autoPublishEnabled),
    scheduledPublishAt: event.scheduledPublishAt ? toIso(event.scheduledPublishAt) : null,
    publishError: event.publishError,
    lastPublishAttemptAt: event.lastPublishAttemptAt ? toIso(event.lastPublishAttemptAt) : null,
    createdAt: toIso(event.createdAt),
    closesAt: toIso(event.closesAt),
    expiresAt: toIso(event.expiresAt),
    participantCount: countParticipants(event),
    waitlistCount: event.waitlist?.length ?? 0,
    fillerCount: countFillers(event),
    channelId: event.channelId,
    messageId: event.messageId
  };
}

type ParticipantSource = {
  userId: string;
  displayName?: string;
  userName?: string;
};

type EnrichedParticipantFields = {
  displayName: string;
  avatarUrl: string | null;
  className: string | null;
  spec: string | null;
  gearScore: number | null;
};

async function getParticipantProfiles(guildId: string, participants: ParticipantSource[]) {
  const userIds = Array.from(new Set(participants.map((participant) => participant.userId).filter(Boolean)));
  const [members, garmothProfiles] = await Promise.all([
    fetchDiscordGuildMembers(guildId, userIds),
    prisma.garmothProfile.findMany({
      where: {
        guildId,
        discordUserId: { in: userIds }
      },
      select: {
        discordUserId: true,
        className: true,
        spec: true,
        specRaw: true,
        gearScore: true
      }
    })
  ]);

  const garmothByUserId = new Map(garmothProfiles.map((profile) => [profile.discordUserId, profile]));

  function readableName(userId: string, ...values: Array<string | null | undefined>) {
    for (const value of values) {
      const trimmed = value?.trim();
      if (trimmed && trimmed !== userId) {
        return trimmed;
      }
    }

    return userId;
  }

  return function enrich(participant: ParticipantSource): EnrichedParticipantFields {
    const member = members.get(participant.userId);
    const profile = garmothByUserId.get(participant.userId);

    return {
      displayName: readableName(
        participant.userId,
        member?.displayName,
        participant.displayName,
        participant.userName,
        member?.username
      ),
      avatarUrl: member?.avatarUrl ?? null,
      className: profile?.className ?? null,
      spec: profile?.spec ?? profile?.specRaw ?? null,
      gearScore: profile?.gearScore ?? null
    };
  };
}

export async function getGuildEvents(guildId: string): Promise<EventListItem[]> {
  const events = await prisma.event.findMany({
    where: { guildId },
    orderBy: [{ isClosed: "asc" }, { closesAt: "asc" }, { createdAt: "desc" }],
    include: {
      schedule: true,
      participants: true,
      enrollments: true,
      waitlist: true,
      fillers: true
    },
    take: 100
  });

  return events.map(toEventListItem);
}

export async function getGuildEventsByType(guildId: string, eventType: string): Promise<EventListItem[]> {
  const events = await prisma.event.findMany({
    where: { guildId, eventType },
    orderBy: [{ isClosed: "asc" }, { closesAt: "asc" }, { createdAt: "desc" }],
    include: {
      schedule: true,
      participants: true,
      enrollments: true,
      waitlist: true,
      fillers: true
    },
    take: 100
  });

  return events.map(toEventListItem);
}

export async function getGuildEventsByTypes(guildId: string, eventTypes: string[]): Promise<EventListItem[]> {
  const events = await prisma.event.findMany({
    where: { guildId, eventType: { in: eventTypes } },
    orderBy: [{ isClosed: "asc" }, { closesAt: "asc" }, { createdAt: "desc" }],
    include: {
      schedule: true,
      participants: true,
      enrollments: true,
      waitlist: true,
      fillers: true
    },
    take: 100
  });

  return events.map(toEventListItem);
}

export async function getGuildEventDetail(guildId: string, eventId: string): Promise<EventDetail | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, guildId },
    include: {
      roleSlots: {
        orderBy: { position: "asc" },
        include: {
          permissions: true,
          users: {
            orderBy: { joinedAt: "asc" }
          }
        }
      },
      schedule: true,
      enrollments: {
        orderBy: { joinedAt: "asc" },
        include: {
          option: true
        }
      },
      options: {
        orderBy: { position: "asc" }
      },
      waitlist: {
        orderBy: { position: "asc" }
      },
      fillers: {
        orderBy: { joinedAt: "asc" }
      }
    }
  });

  if (!event) {
    return null;
  }

  const base = toEventListItem(event);
  const enrichParticipant = await getParticipantProfiles(guildId, [
    ...event.roleSlots.flatMap((slot) => slot.users),
    ...event.enrollments,
    ...event.waitlist.map((entry) => ({ userId: entry.userId, userName: entry.userName })),
    ...event.fillers
  ]);

  return {
    ...base,
    creatorId: event.creatorId,
    duration: event.duration,
    closeBeforeMinutes: event.closeBeforeMinutes,
    roleSlots: event.roleSlots.map((slot: EventRoleSlot & { users: EventParticipant[]; permissions: Array<{ discordRoleId: string | null; discordRoleName: string | null }> }) => ({
      id: slot.id,
      name: slot.name,
      max: slot.max,
      position: slot.position,
      emoji: slot.emoji,
      emojiSource: slot.emojiSource,
      allowedRoleIds: slot.permissions.map((permission) => permission.discordRoleId).filter((roleId): roleId is string => Boolean(roleId)),
      permissions: slot.permissions.map((permission) => ({
        discordRoleId: permission.discordRoleId,
        discordRoleName: permission.discordRoleName
      })),
      participants: slot.users.map((participant) => {
        const enriched = enrichParticipant(participant);

        return {
          id: participant.id,
          userId: participant.userId,
          displayName: enriched.displayName,
          avatarUrl: enriched.avatarUrl,
          className: enriched.className,
          spec: enriched.spec,
          gearScore: enriched.gearScore,
          isFake: participant.isFake,
          joinedAt: toIso(participant.joinedAt)
        };
      })
    })),
    enrollments: event.enrollments.map((enrollment) => {
      const enriched = enrichParticipant(enrollment);

      return {
        id: enrollment.id,
        optionId: enrollment.optionId,
        optionLabel: enrollment.option.label,
        optionTime: enrollment.option.time,
        userId: enrollment.userId,
        displayName: enriched.displayName,
        avatarUrl: enriched.avatarUrl,
        className: enriched.className,
        spec: enriched.spec,
        gearScore: enriched.gearScore,
        enrollmentType: enrollment.enrollmentType,
        isFake: enrollment.isFake,
        joinedAt: toIso(enrollment.joinedAt)
      };
    }),
    options: event.options.map((option) => ({
      id: option.id,
      label: option.label,
      time: option.time,
      capacity: option.capacity,
      position: option.position
    })),
    waitlist: event.waitlist.map((entry) => {
      const enriched = enrichParticipant({ userId: entry.userId, userName: entry.userName });

      return {
        id: entry.id,
        position: entry.position,
        userId: entry.userId,
        userName: enriched.displayName,
        avatarUrl: enriched.avatarUrl,
        className: enriched.className,
        spec: enriched.spec,
        gearScore: enriched.gearScore,
        roleName: entry.roleName,
        isFake: entry.isFake,
        joinedAt: toIso(entry.joinedAt)
      };
    }),
    fillers: event.fillers.map((entry) => {
      const enriched = enrichParticipant(entry);

      return {
        id: entry.id,
        userId: entry.userId,
        displayName: enriched.displayName,
        avatarUrl: enriched.avatarUrl,
        className: enriched.className,
        spec: enriched.spec,
        gearScore: enriched.gearScore,
        isFake: entry.isFake,
        joinedAt: toIso(entry.joinedAt)
      };
    }),
    discordUrl:
      event.guildId && event.channelId && event.messageId
        ? `https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId}`
        : null
  };
}

export async function getGuildOverview(guildId: string): Promise<OverviewData> {
  const now = new Date();
  const [events, scheduledEvents, templates, garmothProfiles] = await Promise.all([
    prisma.event.findMany({
      where: { guildId },
      orderBy: [{ isClosed: "asc" }, { closesAt: "asc" }, { createdAt: "desc" }],
      include: {
        participants: true,
        enrollments: true,
        waitlist: true,
        fillers: true
      },
      take: 12
    }),
    prisma.eventSchedule.count({
      where: {
        enabled: true,
        event: { guildId }
      }
    }),
    prisma.eventTemplate.count({
      where: { guildId, isArchived: false }
    }),
    prisma.garmothProfile.count({
      where: { guildId }
    })
  ]);

  const allCounts = await prisma.event.findMany({
    where: { guildId },
    select: {
      isClosed: true,
      closesAt: true,
      expiresAt: true,
      participants: { select: { id: true } },
      enrollments: { select: { id: true } }
    }
  });

  return {
    activeEvents: allCounts.filter((event) => !event.isClosed && event.closesAt >= now && event.expiresAt >= now).length,
    upcomingEvents: allCounts.filter((event) => event.expiresAt >= now).length,
    totalEvents: allCounts.length,
    totalParticipants: allCounts.reduce((total, event) => total + event.participants.length + event.enrollments.length, 0),
    scheduledEvents,
    templates,
    garmothProfiles,
    recentEvents: events.map(toEventListItem)
  };
}

export async function getGuildTemplates(guildId: string) {
  return prisma.eventTemplate.findMany({
    where: { guildId },
    orderBy: [{ isArchived: "asc" }, { updatedAt: "desc" }],
    include: {
      roleSlots: {
        orderBy: { position: "asc" },
        include: { permissions: true }
      },
      notifyTargets: { orderBy: { position: "asc" } }
    }
  });
}

export async function getGuildTemplateDetail(guildId: string, templateId: string) {
  return prisma.eventTemplate.findFirst({
    where: { id: templateId, guildId },
    include: {
      roleSlots: {
        orderBy: { position: "asc" },
        include: {
          permissions: true
        }
      },
      notifyTargets: {
        orderBy: { position: "asc" }
      }
    }
  });
}

export async function deleteGuildDraftEvent(guildId: string, eventId: string) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: eventId, guildId },
      select: { id: true, messageId: true }
    });

    if (!event) {
      return { status: "not_found" as const };
    }

    if (!canDeleteEventPermanently(event)) {
      return { status: "not_draft" as const };
    }

    await tx.event.delete({ where: { id: event.id } });
    return { status: "deleted" as const };
  });
}

export async function archiveGuildEvent(guildId: string, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, guildId },
    select: { id: true, isClosed: true, channelId: true, messageId: true }
  });

  if (!event) {
    return null;
  }

  if (event.isClosed) {
    return event;
  }

  const now = new Date();
  return prisma.event.update({
    where: { id: event.id },
    data: {
      isClosed: true,
      closesAt: now,
      expiresAt: now
    },
    select: { id: true, isClosed: true, channelId: true, messageId: true }
  });
}

export async function archiveGuildTemplate(guildId: string, templateId: string) {
  const template = await prisma.eventTemplate.findFirst({
    where: { id: templateId, guildId },
    select: { id: true, isArchived: true }
  });

  if (!template) {
    return null;
  }

  if (template.isArchived) {
    return template;
  }

  return prisma.eventTemplate.update({
    where: { id: template.id },
    data: { isArchived: true },
    select: { id: true, isArchived: true }
  });
}

export async function createGuildTemplate(guildId: string, input: CreateGuildTemplateInput) {
  const slots = [...input.slots].sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  const timezone = normalizeTimezone(input.timezone);

  return prisma.$transaction(async (tx) => {
    await tx.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId }
    });

    const template = await tx.eventTemplate.create({
      data: {
        guildId,
        name: input.name,
        eventType: input.eventType,
        typeDefault: input.typeDefault,
        timezone,
        time: input.time ?? null,
        duration: 70,
        closeBeforeMinutes: 0,
        isArchived: false
      },
      select: { id: true }
    });

    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const createdSlot = await tx.eventTemplateRoleSlot.create({
        data: {
          templateId: template.id,
          position: index,
          name: slot.name,
          max: slot.max,
          emoji: slot.emoji ?? null,
          emojiSource: slot.emojiSource ?? null
        },
        select: { id: true }
      });

      const allowedRoleIds = Array.from(new Set((slot.allowedRoleIds ?? []).map(String).filter(Boolean)));
      for (const roleId of allowedRoleIds) {
        await tx.eventTemplateRolePermission.create({
          data: {
            roleSlotId: createdSlot.id,
            discordRoleId: roleId,
            discordRoleName: null
          }
        });
      }
    }

    return template;
  });
}

export async function getGuildSchedules(guildId: string) {
  return prisma.eventSchedule.findMany({
    where: { event: { guildId } },
    orderBy: [{ enabled: "desc" }, { lastCreatedAt: "desc" }],
    include: {
      event: true
    }
  });
}

export async function getGuildGarmothProfiles(guildId: string) {
  return prisma.garmothProfile.findMany({
    where: { guildId },
    orderBy: [{ updatedAt: "desc" }]
  });
}

export async function createGuildEventDraft(guildId: string, creatorId: string | null, input: CreateGuildEventInput) {
  const timezone = normalizeTimezone(input.timezone);
  const lifecycleDates = calculateEventLifecycleDates({
    date: input.date,
    time: input.time,
    timezone,
    duration: input.duration,
    closeBeforeMinutes: input.closeBeforeMinutes
  });
  if (!lifecycleDates) {
    throw new Error("Invalid event date, time, timezone, duration, or close-before setting.");
  }
  const { startsAt, expiresAt, closesAt } = lifecycleDates;
  const autoPublishEnabled = Boolean(input.autoPublishEnabled);
  const scheduledPublishAt = autoPublishEnabled
    ? calculateScheduledPublishAt({ startsAt, publishBeforeMinutes: input.publishBeforeMinutes ?? 60 })
    : null;
  if (autoPublishEnabled && !scheduledPublishAt) {
    throw new Error("Invalid scheduled publish configuration.");
  }
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
    .formatToParts(startsAt)
    .find((part) => part.type === "weekday")?.value;
  const dayOfWeekIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayOfWeek ?? "");

  return prisma.$transaction(async (tx) => {
    await tx.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId }
    });

    let slots = input.slots
      ? [...input.slots].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      : [];
    let templateDefaults:
      | {
          classIconSource: string;
          participantDisplayStyle: string;
        }
      | null = null;

    if (input.templateId) {
      const template = await tx.eventTemplate.findFirst({
        where: {
          id: input.templateId,
          guildId,
          eventType: input.eventType,
          isArchived: false
        },
        include: {
          roleSlots: {
            orderBy: { position: "asc" },
            include: { permissions: true }
          }
        }
      });

      if (!template) {
        throw new Error("Template not found for this guild and event type.");
      }

      templateDefaults = {
        classIconSource: template.classIconSource,
        participantDisplayStyle: template.participantDisplayStyle
      };
      slots = template.roleSlots.map((slot) => ({
        name: slot.name,
        max: slot.max,
        emoji: slot.emoji,
        emojiSource: slot.emojiSource,
        permissions: slot.permissions
      }));
    }

    const isPve = input.eventType === "pve";
    const pveOptions = input.pveOptions
      ? [...input.pveOptions].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      : [];

    if (!isPve && !slots.length) {
      throw new Error("At least one slot is required to create a draft event.");
    }

    if (isPve && !pveOptions.length && !slots.length) {
      throw new Error("At least one PvE time option is required to create a draft event.");
    }

    const eventId = `web_${crypto.randomUUID()}`;
    const isRecurring = input.recurrence === "weekly";
    const groupId = isRecurring ? `web_series_${crypto.randomUUID()}` : null;
    const event = await tx.event.create({
      data: {
        id: eventId,
        groupId,
        eventType: input.eventType,
        accessMode: "OPEN",
        name: input.name,
        type: input.type,
        classIconSource: templateDefaults?.classIconSource ?? "bot",
        participantDisplayStyle: templateDefaults?.participantDisplayStyle ?? "modern",
        creatorId,
        guildId,
        channelId: input.channelId ?? null,
        messageId: null,
        dayOfWeek: isRecurring && dayOfWeekIndex >= 0 ? dayOfWeekIndex : null,
        time: input.time,
        timezone,
        duration: input.duration,
        closeBeforeMinutes: input.closeBeforeMinutes,
        autoPublishEnabled,
        scheduledPublishAt,
        publishError: null,
        lastPublishAttemptAt: null,
        createdAt: new Date(),
        expiresAt,
        closesAt,
        isClosed: false
      },
      select: { id: true }
    });

    if (isPve && pveOptions.length) {
      for (let index = 0; index < pveOptions.length; index += 1) {
        const option = pveOptions[index];
        await tx.eventOption.create({
          data: {
            eventId: event.id,
            position: index,
            label: option.label,
            time: option.time,
            capacity: option.capacity
          }
        });
      }
    }

    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index] as (typeof slots)[number] & {
        permissions?: Array<{ discordRoleId: string | null; discordRoleName: string | null }>;
        allowedRoleIds?: string[];
      };
      const createdSlot = await tx.eventRoleSlot.create({
        data: {
          eventId: event.id,
          position: index,
          name: slot.name,
          max: slot.max,
          emoji: slot.emoji ?? null,
          emojiSource: slot.emojiSource ?? null
        },
        select: { id: true }
      });

      const slotPermissions = slot.permissions?.length
        ? slot.permissions
        : Array.from(new Set((slot.allowedRoleIds ?? []).map(String).filter(Boolean))).map((roleId) => ({
            discordRoleId: roleId,
            discordRoleName: null
          }));

      for (const permission of slotPermissions) {
        await tx.eventRolePermission.create({
          data: {
            roleSlotId: createdSlot.id,
            discordRoleId: permission.discordRoleId,
            discordRoleName: permission.discordRoleName
          }
        });
      }
    }

    const accessRoleIds = Array.from(new Set((input.accessRoleIds ?? []).map(String).filter(Boolean)));
    for (let index = 0; index < accessRoleIds.length; index += 1) {
      await tx.eventAccessRole.create({
        data: {
          eventId: event.id,
          roleId: accessRoleIds[index],
          position: index
        }
      });
    }

    const notifyRoleIds = Array.from(new Set((input.notifyRoleIds ?? []).map(String).filter(Boolean)));
    for (let index = 0; index < notifyRoleIds.length; index += 1) {
      await tx.eventNotifyTarget.create({
        data: {
          eventId: event.id,
          targetId: notifyRoleIds[index],
          position: index
        }
      });
    }

    await tx.eventSchedule.create({
      data: {
        eventId: event.id,
        enabled: isRecurring,
        mode: isRecurring ? "recurring" : "once"
      }
    });

    if (input.recap?.enabled) {
      await tx.eventRecapConfig.create({
        data: {
          eventId: event.id,
          enabled: true,
          minutesBeforeExpire: input.recap.minutesBeforeExpire,
          messageText: input.recap.messageText,
          threadId: null,
          lastPostedAt: null
        }
      });
    }

    return event;
  });
}

export async function getGuildClassStats(guildId: string) {
  const profiles = await prisma.garmothProfile.findMany({
    where: { guildId },
    select: {
      className: true,
      spec: true,
      specRaw: true,
      gearScore: true
    }
  });

  const byClass = new Map<string, { className: string; count: number; gearScoreTotal: number; gearScoreCount: number }>();
  const bySpec = new Map<string, number>();

  for (const profile of profiles) {
    const className = profile.className || "Unknown";
    const current = byClass.get(className) ?? { className, count: 0, gearScoreTotal: 0, gearScoreCount: 0 };
    current.count += 1;
    if (typeof profile.gearScore === "number") {
      current.gearScoreTotal += profile.gearScore;
      current.gearScoreCount += 1;
    }
    byClass.set(className, current);

    const spec = profile.spec || profile.specRaw || "Unknown";
    bySpec.set(spec, (bySpec.get(spec) ?? 0) + 1);
  }

  return {
    classes: Array.from(byClass.values())
      .map((entry) => ({
        className: entry.className,
        count: entry.count,
        averageGearScore: entry.gearScoreCount ? Math.round(entry.gearScoreTotal / entry.gearScoreCount) : null
      }))
      .sort((a, b) => b.count - a.count || a.className.localeCompare(b.className)),
    specs: Array.from(bySpec.entries())
      .map(([spec, count]) => ({ spec, count }))
      .sort((a, b) => b.count - a.count || a.spec.localeCompare(b.spec))
  };
}

export async function updateGuildEvent(guildId: string, eventId: string, input: EventMutationInput) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, guildId },
    select: { id: true }
  });

  if (!event) {
    return null;
  }

  await prisma.event.update({
    where: { id: event.id },
    data: input
  });

  return getGuildEventDetail(guildId, event.id);
}

export async function setGuildEventClosed(guildId: string, eventId: string, isClosed: boolean) {
  return updateGuildEvent(guildId, eventId, { isClosed });
}

export async function createGuildEventRoleSlot(guildId: string, eventId: string, input: Required<Pick<RoleSlotMutationInput, "name" | "max">> & Partial<RoleSlotMutationInput>) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, guildId },
    select: {
      id: true,
      roleSlots: {
        select: { position: true },
        orderBy: { position: "desc" },
        take: 1
      }
    }
  });

  if (!event) {
    return null;
  }

  await prisma.eventRoleSlot.create({
    data: {
      eventId: event.id,
      name: input.name,
      max: input.max,
      position: input.position ?? ((event.roleSlots[0]?.position ?? -1) + 1),
      emoji: input.emoji ?? null,
      emojiSource: input.emojiSource ?? null
    }
  });

  return getGuildEventDetail(guildId, event.id);
}

export async function updateGuildEventRoleSlot(guildId: string, eventId: string, slotId: string, input: RoleSlotMutationInput) {
  const slot = await prisma.eventRoleSlot.findFirst({
    where: { id: slotId, eventId, event: { guildId } },
    select: { id: true, eventId: true }
  });

  if (!slot) {
    return null;
  }

  const { allowedRoleIds, ...slotPatch } = input;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(slotPatch).length) {
      await tx.eventRoleSlot.update({
        where: { id: slot.id },
        data: slotPatch
      });
    }

    if (Array.isArray(allowedRoleIds)) {
      const uniqueRoleIds = Array.from(new Set(allowedRoleIds.map(String).filter(Boolean)));
      await tx.eventRolePermission.deleteMany({
        where: { roleSlotId: slot.id }
      });
      if (uniqueRoleIds.length) {
        await tx.eventRolePermission.createMany({
          data: uniqueRoleIds.map((roleId) => ({
            roleSlotId: slot.id,
            discordRoleId: roleId,
            discordRoleName: null
          }))
        });
      }
    }
  });

  return getGuildEventDetail(guildId, slot.eventId);
}

export async function updateGuildEventRoleSlotSeries(guildId: string, eventId: string, slotId: string, input: RoleSlotMutationInput) {
  const slot = await prisma.eventRoleSlot.findFirst({
    where: { id: slotId, eventId, event: { guildId } },
    select: {
      id: true,
      position: true,
      event: {
        select: {
          id: true,
          groupId: true,
          schedule: { select: { mode: true } }
        }
      }
    }
  });

  if (!slot) {
    return null;
  }

  if (!slot.event.groupId || slot.event.schedule?.mode !== "recurring") {
    return updateGuildEventRoleSlot(guildId, eventId, slotId, input);
  }

  const targetSlots = await prisma.eventRoleSlot.findMany({
    where: {
      position: slot.position,
      event: {
        guildId,
        groupId: slot.event.groupId
      }
    },
    select: { id: true }
  });
  const { allowedRoleIds, ...slotPatch } = input;

  await prisma.$transaction(async (tx) => {
    for (const target of targetSlots) {
      if (Object.keys(slotPatch).length) {
        await tx.eventRoleSlot.update({
          where: { id: target.id },
          data: slotPatch
        });
      }

      if (Array.isArray(allowedRoleIds)) {
        const uniqueRoleIds = Array.from(new Set(allowedRoleIds.map(String).filter(Boolean)));
        await tx.eventRolePermission.deleteMany({
          where: { roleSlotId: target.id }
        });
        if (uniqueRoleIds.length) {
          await tx.eventRolePermission.createMany({
            data: uniqueRoleIds.map((roleId) => ({
              roleSlotId: target.id,
              discordRoleId: roleId,
              discordRoleName: null
            }))
          });
        }
      }
    }
  });

  return getGuildEventDetail(guildId, eventId);
}

export async function deleteGuildEventRoleSlot(guildId: string, eventId: string, slotId: string) {
  const slot = await prisma.eventRoleSlot.findFirst({
    where: { id: slotId, eventId, event: { guildId } },
    select: { id: true, eventId: true, _count: { select: { users: true } } }
  });

  if (!slot) {
    return null;
  }

  if (slot._count.users > 0) {
    return { blocked: "Slot has participants and cannot be deleted safely." } as const;
  }

  await prisma.eventRoleSlot.delete({ where: { id: slot.id } });
  return getGuildEventDetail(guildId, slot.eventId);
}

export async function reorderGuildEventRoleSlots(
  guildId: string,
  eventId: string,
  slots: Array<{ id: string; order: number }>
) {
  const uniqueSlotIds = Array.from(new Set(slots.map((slot) => slot.id).filter(Boolean)));
  if (uniqueSlotIds.length !== slots.length) {
    return { error: "Duplicate slot IDs are not allowed." } as const;
  }

  const existingSlots = await prisma.eventRoleSlot.findMany({
    where: { id: { in: uniqueSlotIds }, eventId, event: { guildId } },
    select: { id: true }
  });

  if (existingSlots.length !== slots.length) {
    return null;
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      slots.map((slot, index) =>
        tx.eventRoleSlot.update({
          where: { id: slot.id },
          data: { position: -10000 - index }
        })
      )
    );

    await Promise.all(
      slots.map((slot) =>
        tx.eventRoleSlot.update({
          where: { id: slot.id },
          data: { position: slot.order }
        })
      )
    );
  });

  return getGuildEventDetail(guildId, eventId);
}

export async function updateGuildTemplate(guildId: string, templateId: string, input: TemplateMutationInput) {
  const template = await prisma.eventTemplate.findFirst({
    where: { id: templateId, guildId },
    select: { id: true }
  });

  if (!template) {
    return null;
  }

  await prisma.eventTemplate.update({
    where: { id: template.id },
    data: input
  });

  return getGuildTemplateDetail(guildId, template.id);
}

export async function createGuildTemplateRoleSlot(guildId: string, templateId: string, input: Required<Pick<RoleSlotMutationInput, "name" | "max">> & Partial<RoleSlotMutationInput>) {
  const template = await prisma.eventTemplate.findFirst({
    where: { id: templateId, guildId },
    select: {
      id: true,
      roleSlots: {
        select: { position: true },
        orderBy: { position: "desc" },
        take: 1
      }
    }
  });

  if (!template) {
    return null;
  }

  await prisma.eventTemplateRoleSlot.create({
    data: {
      templateId: template.id,
      name: input.name,
      max: input.max,
      position: input.position ?? ((template.roleSlots[0]?.position ?? -1) + 1),
      emoji: input.emoji ?? null,
      emojiSource: input.emojiSource ?? null
    }
  });

  return getGuildTemplateDetail(guildId, template.id);
}

export async function updateGuildTemplateRoleSlot(guildId: string, templateId: string, slotId: string, input: RoleSlotMutationInput) {
  const slot = await prisma.eventTemplateRoleSlot.findFirst({
    where: { id: slotId, templateId, template: { guildId } },
    select: { id: true, templateId: true }
  });

  if (!slot) {
    return null;
  }

  await prisma.eventTemplateRoleSlot.update({
    where: { id: slot.id },
    data: input
  });

  return getGuildTemplateDetail(guildId, slot.templateId);
}

export async function deleteGuildTemplateRoleSlot(guildId: string, templateId: string, slotId: string) {
  const slot = await prisma.eventTemplateRoleSlot.findFirst({
    where: { id: slotId, templateId, template: { guildId } },
    select: { id: true, templateId: true }
  });

  if (!slot) {
    return null;
  }

  await prisma.eventTemplateRoleSlot.delete({ where: { id: slot.id } });
  return getGuildTemplateDetail(guildId, slot.templateId);
}

export async function reorderGuildTemplateRoleSlots(
  guildId: string,
  templateId: string,
  slots: Array<{ id: string; order: number }>
) {
  const uniqueSlotIds = Array.from(new Set(slots.map((slot) => slot.id).filter(Boolean)));
  if (uniqueSlotIds.length !== slots.length) {
    return { error: "Duplicate slot IDs are not allowed." } as const;
  }

  const existingSlots = await prisma.eventTemplateRoleSlot.findMany({
    where: { id: { in: uniqueSlotIds }, templateId, template: { guildId } },
    select: { id: true }
  });

  if (existingSlots.length !== slots.length) {
    return null;
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      slots.map((slot, index) =>
        tx.eventTemplateRoleSlot.update({
          where: { id: slot.id },
          data: { position: -10000 - index }
        })
      )
    );

    await Promise.all(
      slots.map((slot) =>
        tx.eventTemplateRoleSlot.update({
          where: { id: slot.id },
          data: { position: slot.order }
        })
      )
    );
  });

  return getGuildTemplateDetail(guildId, templateId);
}
