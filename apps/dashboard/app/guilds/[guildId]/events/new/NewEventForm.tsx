"use client";

import { type CSSProperties, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Clock, Hash, LayoutTemplate, Plus, Search, Shield, Trash2, X } from "lucide-react";
import { SortableSlotGrid } from "@/components/dashboard/slots/SortableSlotGrid";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { filterChannelsBySearch } from "@/lib/channelSearch";
import { EmojiPicker } from "@/app/guilds/[guildId]/_components/emoji/EmojiPicker";
import { SlotEmoji } from "@/app/guilds/[guildId]/_components/shared/SlotEmoji";
import overviewStyles from "@/app/guilds/[guildId]/_styles/overview.module.css";
import styles from "./EventCreate.module.css";
import selectorStyles from "./RoleMultiSelect.module.css";

type TemplateOption = {
  id: string;
  name: string;
  eventType: string;
  typeDefault: string;
  timezone: string;
  time: string | null;
  duration: number;
  closeBeforeMinutes: number;
  slotCount: number;
};

export type RoleOption = {
  id: string;
  name: string;
  color: number | null;
  managed: boolean;
};

type ChannelOption = {
  displayName?: string | null;
  id: string;
  label?: string | null;
  name: string;
  type: number;
};

type ManualSlot = {
  id: string;
  name: string;
  max: number;
  position: number;
  emoji: string;
  emojiSource: string;
  allowedRoleIds: string[];
};

type PveOption = {
  id: string;
  label: string;
  time: string;
  capacity: number;
  position: number;
};

type NewEventFormProps = {
  guildId: string;
  manageable: boolean;
  templates: TemplateOption[];
  roles: RoleOption[];
  channels: ChannelOption[];
};

const steps = ["Basics", "Schedule", "Slots", "Permissions & Post setup", "Review"] as const;
const eventTypes = [
  { value: "war", label: "War", defaultType: "Evento de guerra" },
  { value: "siege", label: "Siege", defaultType: "Evento de asedio" },
  { value: "pve", label: "PvE", defaultType: "Evento PvE" },
  { value: "10v10", label: "10x10", defaultType: "Evento 10v10" }
];
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function todayForInput() {
  return new Date().toISOString().slice(0, 10);
}

function weekdayForDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "selected weekday" : weekdays[date.getDay()];
}

function makeSlot(position: number): ManualSlot {
  return {
    id: crypto.randomUUID(),
    name: "",
    max: 1,
    position,
    emoji: "",
    emojiSource: "",
    allowedRoleIds: []
  };
}

function makePveOption(position: number, time = "20:00"): PveOption {
  return {
    id: crypto.randomUUID(),
    label: time,
    time,
    capacity: 5,
    position
  };
}

async function createDraft(guildId: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/guilds/${guildId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = (await response.json().catch(() => null)) as { eventId?: string; error?: string } | null;

  if (!response.ok || !json?.eventId) {
    throw new Error(json?.error ?? "Draft event creation failed.");
  }

  return json.eventId;
}

async function loadGuildConfig<T>(url: string, key: string): Promise<{ values: T[]; error: string | null }> {
  const response = await fetch(url);
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const values = json?.[key];

  if (!response.ok || !Array.isArray(values)) {
    return { values: [], error: typeof json?.error === "string" ? json.error : `Failed to load ${key}.` };
  }

  return { values: values as T[], error: null };
}

function useFloatingDropdown(open: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});

  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 4;
    const preferredHeight = 260;
    const minUsableHeight = 140;
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
    const availableBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding - gap);
    const availableAbove = Math.max(0, rect.top - viewportPadding - gap);
    const measuredHeight = dropdownRef.current?.offsetHeight ?? preferredHeight;
    const desiredHeight = Math.min(measuredHeight, preferredHeight);
    const shouldOpenAbove = availableBelow < Math.min(desiredHeight, minUsableHeight) && availableAbove > availableBelow;
    const availableHeight = shouldOpenAbove ? availableAbove : availableBelow;
    const maxHeight = Math.max(Math.min(preferredHeight, availableHeight), Math.min(minUsableHeight, Math.max(availableAbove, availableBelow)));
    const panelHeight = Math.min(desiredHeight, maxHeight);

    setDropdownStyle({
      left,
      maxHeight,
      top: shouldOpenAbove ? rect.top - gap - panelHeight : rect.bottom + gap,
      width
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return { containerRef, dropdownRef, dropdownStyle };
}

export function RoleMultiSelect({
  label,
  roles,
  selected,
  onChange,
  emptyText,
  loadError
}: {
  label: string;
  roles: RoleOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyText: string;
  loadError?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { containerRef, dropdownRef, dropdownStyle } = useFloatingDropdown(open);
  const selectedRoles = selected
    .map((roleId) => roles.find((role) => role.id === roleId))
    .filter((role): role is RoleOption => Boolean(role));
  const filteredRoles = roles
    .filter((role) => role.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80);

  const toggle = (roleId: string) => {
    onChange(selected.includes(roleId) ? selected.filter((id) => id !== roleId) : [...selected, roleId]);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className={selectorStyles.roleMultiSelect} ref={containerRef}>
      <div className={selectorStyles.rolePickerHeader}>
        <div>
          <div className={selectorStyles.fieldHeading}>{label}</div>
          <span>{selected.length === 1 ? "1 role selected" : `${selected.length} roles selected`}</span>
        </div>
        {selected.length ? <button onClick={() => onChange([])} type="button">Clear</button> : null}
      </div>
      <button className={`${selectorStyles.roleSelectTrigger} ${open ? selectorStyles.selectorOpen : ""}`} disabled={!roles.length} onClick={() => setOpen((current) => !current)} type="button">
        <span>{roles.length ? (selected.length ? `${selected.length} roles selected` : "Select roles") : loadError ?? emptyText}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {!roles.length ? <p className={selectorStyles.inlineHelp}>{loadError ?? emptyText}</p> : null}
      {selectedRoles.length ? (
        <div className={selectorStyles.selectedRoleChips}>
          {selectedRoles.slice(0, 10).map((role) => (
            <button aria-label={`Remove ${role.name}`} key={role.id} onClick={() => toggle(role.id)} type="button">
              {role.name}
              <X size={12} aria-hidden="true" />
            </button>
          ))}
          {selectedRoles.length > 10 ? <span>+{selectedRoles.length - 10}</span> : null}
        </div>
      ) : null}
      {open && roles.length && typeof document !== "undefined" ? createPortal(
        <div className={selectorStyles.roleDropdown} ref={dropdownRef} style={dropdownStyle}>
          <label className={selectorStyles.roleSearch}>
            <Search size={14} aria-hidden="true" />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search roles" value={query} />
          </label>
          <div className={selectorStyles.roleOptionsList}>
            {filteredRoles.length ? (
              filteredRoles.map((role) => (
                <button aria-pressed={selected.includes(role.id)} key={role.id} onClick={() => toggle(role.id)} type="button">
                  <span>{role.name}</span>
                  {selected.includes(role.id) ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              ))
            ) : (
              <p>No roles match that search.</p>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function ChannelSelect({
  channels,
  value,
  onChange,
  emptyText
}: {
  channels: ChannelOption[];
  value: string;
  onChange: (channelId: string) => void;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { containerRef, dropdownRef, dropdownStyle } = useFloatingDropdown(open);
  const selected = channels.find((channel) => channel.id === value);
  const filtered = useMemo(() => filterChannelsBySearch(channels, query), [channels, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className={selectorStyles.channelSelect} ref={containerRef}>
      <button className={`${selectorStyles.roleSelectTrigger} ${open ? selectorStyles.selectorOpen : ""}`} disabled={!channels.length} onClick={() => setOpen((current) => !current)} type="button">
        <span>{selected ? `#${selected.name}` : channels.length ? "No channel selected" : emptyText}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && channels.length && typeof document !== "undefined" ? createPortal(
        <div className={selectorStyles.roleDropdown} ref={dropdownRef} style={dropdownStyle}>
          <label className={selectorStyles.roleSearch}>
            <Search size={14} aria-hidden="true" />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search channels" value={query} />
          </label>
          <div className={selectorStyles.roleOptionsList}>
            <button aria-pressed={!value} onClick={() => {
              onChange("");
              setOpen(false);
            }} type="button">
              <span>No channel selected</span>
              {!value ? <Check size={14} aria-hidden="true" /> : null}
            </button>
            {filtered.length ? (
              filtered.map((channel) => (
                <button aria-pressed={channel.id === value} key={channel.id} onClick={() => {
                  onChange(channel.id);
                  setOpen(false);
                }} type="button">
                  <span>#{channel.name}</span>
                  {channel.id === value ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              ))
            ) : query.trim() ? (
              <p>No postable channels match that search.</p>
            ) : (
              <p>No postable channels could be loaded.</p>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

export function NewEventForm({ guildId, manageable, templates, roles: initialRoles, channels: initialChannels }: NewEventFormProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [eventType, setEventType] = useState("war");
  const [templateId, setTemplateId] = useState("");
  const [mode, setMode] = useState<"template" | "manual">("template");
  const [name, setName] = useState("");
  const [type, setType] = useState("Evento de guerra");
  const [date, setDate] = useState(todayForInput);
  const [time, setTime] = useState("20:00");
  const [timezone, setTimezone] = useState("America/Bogota");
  const [duration, setDuration] = useState(70);
  const [closeBeforeMinutes, setCloseBeforeMinutes] = useState(0);
  const [manualSlots, setManualSlots] = useState<ManualSlot[]>([makeSlot(1)]);
  const [pveOptions, setPveOptions] = useState<PveOption[]>([makePveOption(1, "20:00"), makePveOption(2, "21:00")]);
  const [roles, setRoles] = useState<RoleOption[]>(initialRoles);
  const [roleLoadError, setRoleLoadError] = useState<string | null>(initialRoles.length ? null : "No roles were returned for this guild.");
  const [channels, setChannels] = useState<ChannelOption[]>(initialChannels);
  const [channelLoadError, setChannelLoadError] = useState<string | null>(initialChannels.length ? null : "No postable channels were returned for this guild.");
  const [channelId, setChannelId] = useState("");
  const [manualChannelId, setManualChannelId] = useState("");
  const [channelMode, setChannelMode] = useState<"select" | "manual">(initialChannels.length ? "select" : "manual");
  const [accessRestrictionsOpen, setAccessRestrictionsOpen] = useState(false);
  const [accessRestrictionEnabled, setAccessRestrictionEnabled] = useState(false);
  const [accessRoleIds, setAccessRoleIds] = useState<string[]>([]);
  const [mentionMode, setMentionMode] = useState<"none" | "roles">("none");
  const [notifyRoleIds, setNotifyRoleIds] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<"single" | "weekly">("single");
  const [recapEnabled, setRecapEnabled] = useState(false);
  const [recapMinutes, setRecapMinutes] = useState(0);
  const [recapMessage, setRecapMessage] = useState("Resumen del evento");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      loadGuildConfig<RoleOption>(`/api/guilds/${guildId}/roles`, "roles").then((result) => {
        if (result.values.length) {
          setRoles(result.values);
          setRoleLoadError(null);
        } else if (result.error) {
          setRoleLoadError(result.error);
        }
      }),
      loadGuildConfig<ChannelOption>(`/api/guilds/${guildId}/channels`, "channels").then((result) => {
        if (result.values.length) {
          setChannels(result.values);
          setChannelLoadError(null);
          setChannelMode((current) => (current === "manual" ? "select" : current));
        } else if (result.error) {
          setChannelLoadError(result.error);
        }
      })
    ]);
  }, [guildId]);

  const compatibleTemplates = useMemo(
    () => templates.filter((template) => template.eventType === eventType && template.slotCount > 0),
    [eventType, templates]
  );
  const selectedTemplate = compatibleTemplates.find((template) => template.id === templateId);
  const isPve = eventType === "pve";
  const finalChannelId = channelMode === "select" ? channelId || null : manualChannelId.trim() || null;
  const selectedChannel = channels.find((channel) => channel.id === finalChannelId);
  const roleName = (roleId: string) => roles.find((role) => role.id === roleId)?.name ?? roleId;
  const slotCount = isPve ? pveOptions.length : mode === "template" ? selectedTemplate?.slotCount ?? 0 : manualSlots.length;
  const totalCapacity = mode === "manual" ? manualSlots.reduce((total, slot) => total + slot.max, 0) : null;
  const pveCapacity = pveOptions.reduce((total, option) => total + option.capacity, 0);

  const setEventTypeWithDefaults = (value: string) => {
    setEventType(value);
    setTemplateId("");
    setMode(value === "pve" ? "manual" : "template");
    setType(eventTypes.find((item) => item.value === value)?.defaultType ?? "Evento");
  };

  const applyTemplate = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
    const template = compatibleTemplates.find((item) => item.id === nextTemplateId);
    if (!template) {
      return;
    }

    setType(template.typeDefault);
    setTimezone(template.timezone);
    setTime(template.time ?? time);
    setDuration(template.duration);
    setCloseBeforeMinutes(template.closeBeforeMinutes);
  };

  const addSlot = () => setManualSlots((current) => [...current, makeSlot(current.length + 1)]);
  const removeSlot = (slotId: string) => {
    setManualSlots((current) => current.filter((slot) => slot.id !== slotId).map((slot, index) => ({ ...slot, position: index + 1 })));
  };
  const updateSlot = (slotId: string, patch: Partial<ManualSlot>) => {
    setManualSlots((current) => current.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  };
  const moveSlot = (slotId: string, direction: -1 | 1) => {
    setManualSlots((current) => {
      const index = current.findIndex((slot) => slot.id === slotId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [slot] = next.splice(index, 1);
      next.splice(nextIndex, 0, slot);
      return next.map((item, itemIndex) => ({ ...item, position: itemIndex + 1 }));
    });
  };
  const addPveOption = () => setPveOptions((current) => [...current, makePveOption(current.length + 1, time)]);
  const removePveOption = (optionId: string) => {
    setPveOptions((current) => current.filter((option) => option.id !== optionId).map((option, index) => ({ ...option, position: index + 1 })));
  };
  const updatePveOption = (optionId: string, patch: Partial<PveOption>) => {
    setPveOptions((current) => current.map((option) => (option.id === optionId ? { ...option, ...patch } : option)));
  };
  const movePveOption = (optionId: string, direction: -1 | 1) => {
    setPveOptions((current) => {
      const index = current.findIndex((option) => option.id === optionId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [option] = next.splice(index, 1);
      next.splice(nextIndex, 0, option);
      return next.map((item, itemIndex) => ({ ...item, position: itemIndex + 1 }));
    });
  };

  const canSubmit =
    manageable &&
    !busy &&
    name.trim().length >= 2 &&
    (isPve ? pveOptions.every((option) => option.label.trim() && option.time) : mode === "template" ? Boolean(templateId) : manualSlots.every((slot) => slot.name.trim()));
  const goNext = () => setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  const goBack = () => setStepIndex((current) => Math.max(0, current - 1));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      setMessage("Complete the required draft fields before creating the event.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const eventId = await createDraft(guildId, {
        name,
        eventType,
        type,
        date,
        time,
        timezone,
        duration,
        closeBeforeMinutes,
        channelId: finalChannelId,
        accessRoleIds: accessRestrictionEnabled ? accessRoleIds : [],
        notifyRoleIds: mentionMode === "roles" ? notifyRoleIds : [],
        recurrence,
        recap: {
          enabled: recapEnabled,
          minutesBeforeExpire: recapMinutes,
          messageText: recapMessage
        },
        pveOptions: isPve
          ? pveOptions.map((option, index) => ({
              label: option.label,
              time: option.time,
              capacity: option.capacity,
              position: index + 1
            }))
          : undefined,
        templateId: !isPve && mode === "template" ? templateId || undefined : undefined,
        slots:
          !isPve && mode === "manual"
            ? manualSlots.map((slot, index) => ({
                name: slot.name,
                max: slot.max,
                position: index + 1,
                emoji: slot.emoji || null,
                emojiSource: slot.emojiSource || null,
                allowedRoleIds: slot.allowedRoleIds
              }))
            : undefined
      });

      router.push(guildRoutes.eventDetail(guildId, eventId));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft event creation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.createEventForm} onSubmit={(event) => void submit(event)}>
      <Card className={styles.createEventCard}>
        <div className={styles.createMetaBar}>
          <span className={`${overviewStyles.status} ${overviewStyles.statusDraft}`}>Draft only</span>
          <p>Not published to Discord</p>
        </div>
        <div className={styles.createStepper} aria-label="Create event steps">
          {steps.map((step, index) => (
            <button
              aria-current={stepIndex === index ? "step" : undefined}
              className={stepIndex === index ? styles.stepActive : ""}
              key={step}
              onClick={() => setStepIndex(index)}
              type="button"
            >
              <span>{index + 1}</span>
              {step}
            </button>
          ))}
        </div>

        {message ? <p className={overviewStyles.formNotice}>{message}</p> : null}

        <div className={styles.createPanel}>
          {stepIndex === 0 ? (
            <section className={`${styles.createSection} ${styles.createSectionCompact}`}>
              <div className={styles.createSectionIntro}>
                <span className={overviewStyles.eyebrow}>Basics</span>
                <h3>Event identity</h3>
                <p>Name the draft and choose the BDO event family it belongs to. The next steps adapt to that type.</p>
              </div>
              <div className={styles.basicsGrid}>
                <label className={styles.fieldLarge}>
                  Title
                  <input maxLength={120} minLength={2} onChange={(event) => setName(event.target.value)} placeholder={isPve ? "Guild boss rotation" : "Friday Node War"} required value={name} />
                </label>
                <label>
                  Event type
                  <select onChange={(event) => setEventTypeWithDefaults(event.target.value)} value={eventType}>
                    {eventTypes.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Label
                  <input maxLength={64} onChange={(event) => setType(event.target.value)} required value={type} />
                </label>
                <div className={styles.typeContextPanel}>
                  <span className={`${overviewStyles.status} ${overviewStyles.statusDraft}`}>Draft only</span>
                  <strong>{isPve ? "PvE activity flow" : "War role-slot flow"}</strong>
                  <p>
                    {isPve
                      ? "PvE drafts use time options and capacity, matching the bot's PvE enrollment model."
                      : "War, Siege and 10x10 drafts use role slots with icons, order, capacity and slot-level role restrictions."}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {stepIndex === 1 ? (
            <section className={`${styles.createSection} ${styles.createSectionMedium}`}>
              <div className={styles.createSectionIntro}>
                <span className={overviewStyles.eyebrow}>Schedule</span>
                <h3>Date, time and lifecycle</h3>
                <p>The draft stores the event time, expiry and close-before-expiry values used by the current event lifecycle.</p>
              </div>
              <div className={styles.scheduleGrid}>
                <label>Date<input onChange={(event) => setDate(event.target.value)} required type="date" value={date} /></label>
                <label>Time<input onChange={(event) => setTime(event.target.value)} pattern="\d{1,2}:\d{2}" required type="time" value={time} /></label>
                <label>Timezone<input maxLength={64} onChange={(event) => setTimezone(event.target.value)} required value={timezone} /></label>
                <label>Duration minutes<input max={1440} min={1} onChange={(event) => setDuration(Number(event.target.value))} required type="number" value={duration} /></label>
                <label>Close before expiry<input max={duration} min={0} onChange={(event) => setCloseBeforeMinutes(Number(event.target.value))} type="number" value={closeBeforeMinutes} /></label>
                <div className={styles.segmentBlock}>
                  <div className={styles.fieldHeading}>Recurrence</div>
                  <div className={styles.segmentControl}>
                    <button aria-pressed={recurrence === "single"} onClick={() => setRecurrence("single")} type="button">Single event</button>
                    <button aria-pressed={recurrence === "weekly"} onClick={() => setRecurrence("weekly")} type="button">Weekly</button>
                  </div>
                  <p className={styles.inlineHelp}>
                    {recurrence === "weekly"
                      ? `Persisted as an enabled recurring schedule on ${weekdayForDate(date)}. Multiple weekdays need a later schema/use-case pass.`
                      : "No schedule row is created for single-event drafts."}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {stepIndex === 2 ? (
            <section className={`${styles.createSection} ${styles.createSectionFull}`}>
              <div className={styles.createSectionIntro}>
                <span className={overviewStyles.eyebrow}>Slots</span>
                <h3>{isPve ? "PvE time options" : "Template or manual signup grid"}</h3>
                <p>
                  {isPve
                    ? "PvE events use time options with capacity. Role slots are intentionally hidden for this type."
                    : "Templates copy existing slots and slot permissions. Manual slots can define order, icon, capacity and allowed Discord roles."}
                </p>
              </div>
              {!isPve ? (
                <div className={styles.segmentControl}>
                  <button aria-pressed={mode === "template"} onClick={() => setMode("template")} type="button">Use template</button>
                  <button aria-pressed={mode === "manual"} onClick={() => setMode("manual")} type="button">Manual slots</button>
                </div>
              ) : null}

              {isPve ? (
                <SortableSlotGrid
                  className={styles.pveOptionGrid}
                  items={pveOptions}
                  onReorder={(items) => setPveOptions(items.map((option, index) => ({ ...option, position: index + 1 })))}
                  renderItem={(option, index, dragHandle) => (
                    <div className={styles.pveOptionCard} key={option.id}>
                      <div className={styles.manualSlotHeader}>
                        <div>
                          <span className={overviewStyles.eyebrow}>Option {index + 1}</span>
                          <h4><Clock size={16} aria-hidden="true" />{option.label || option.time}</h4>
                        </div>
                        <div className={styles.orderControls}>
                          {dragHandle}
                          <button disabled={index === 0} onClick={() => movePveOption(option.id, -1)} title="Move up" type="button">Up</button>
                          <button disabled={index === pveOptions.length - 1} onClick={() => movePveOption(option.id, 1)} title="Move down" type="button">Down</button>
                          <Button disabled={pveOptions.length <= 1} onClick={() => removePveOption(option.id)} type="button" variant="ghost">
                            <Trash2 size={16} aria-hidden="true" />
                            Remove
                          </Button>
                        </div>
                      </div>
                      <div className={styles.slotConfigGrid}>
                        <label>Label<input maxLength={80} onChange={(event) => updatePveOption(option.id, { label: event.target.value })} required value={option.label} /></label>
                        <label>Time<input onChange={(event) => updatePveOption(option.id, { time: event.target.value, label: option.label === option.time ? event.target.value : option.label })} required type="time" value={option.time} /></label>
                        <label>Capacity<input max={100} min={1} onChange={(event) => updatePveOption(option.id, { capacity: Number(event.target.value) })} required type="number" value={option.capacity} /></label>
                      </div>
                    </div>
                  )}
                >
                  <div className={styles.pveHelpCard}>
                    <h4>PvE draft model</h4>
                    <p>These options persist as `EventOption` rows. Enrollments, fillers and publication remain untouched until later flows.</p>
                    <Button onClick={addPveOption} type="button" variant="secondary"><Plus size={16} aria-hidden="true" />Add time option</Button>
                  </div>
                </SortableSlotGrid>
              ) : mode === "template" ? (
                <div className={styles.createFieldsWide}>
                  <label className={styles.fieldLarge}>
                    Active template
                    <select onChange={(event) => applyTemplate(event.target.value)} required value={templateId}>
                      <option value="">Select a template</option>
                      {compatibleTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name} ({template.slotCount} slots)</option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.helpPanel}>
                    <LayoutTemplate size={18} aria-hidden="true" />
                    <p>{compatibleTemplates.length ? "The new draft will receive a fresh copy of each template slot and its role restrictions." : "No active template with slots exists for this event type. Switch to Manual slots to continue."}</p>
                  </div>
                </div>
              ) : (
                <SortableSlotGrid
                  className={styles.manualSlotList}
                  items={manualSlots}
                  onReorder={(items) => setManualSlots(items.map((slot, index) => ({ ...slot, position: index + 1 })))}
                  renderItem={(slot, index, dragHandle) => (
                    <div className={styles.manualSlotPanel} key={slot.id}>
                      <div className={styles.manualSlotHeader}>
                        <div>
                          <span className={overviewStyles.eyebrow}>Slot {index + 1}</span>
                          <h4><SlotEmoji value={slot.emoji} />{slot.name || "Unnamed slot"}</h4>
                        </div>
                        <div className={styles.orderControls}>
                          <span><ChevronsUpDown size={14} aria-hidden="true" />Order</span>
                          {dragHandle}
                          <button disabled={index === 0} onClick={() => moveSlot(slot.id, -1)} title="Move up" type="button">Up</button>
                          <button disabled={index === manualSlots.length - 1} onClick={() => moveSlot(slot.id, 1)} title="Move down" type="button">Down</button>
                          <Button disabled={manualSlots.length <= 1} onClick={() => removeSlot(slot.id)} type="button" variant="ghost">
                            <Trash2 size={16} aria-hidden="true" />
                            Remove
                          </Button>
                        </div>
                      </div>
                      <div className={styles.slotConfigGrid}>
                        <label>Name<input maxLength={80} onChange={(event) => updateSlot(slot.id, { name: event.target.value })} required value={slot.name} /></label>
                        <label>Capacity<input max={100} min={1} onChange={(event) => updateSlot(slot.id, { max: Number(event.target.value) })} required type="number" value={slot.max} /></label>
                        <label className={styles.fieldLarge}>
                          Icon
                          <EmojiPicker
                            guildId={guildId}
                            name={`slot-${slot.id}-emoji`}
                            onChange={(value, source) => updateSlot(slot.id, { emoji: value, emojiSource: source })}
                            source={slot.emojiSource}
                            value={slot.emoji}
                          />
                        </label>
                      </div>
                      <RoleMultiSelect
                        emptyText="No roles could be loaded. You can still create the draft and add permissions later."
                        label="Allowed roles for this slot"
                        loadError={roleLoadError}
                        onChange={(ids) => updateSlot(slot.id, { allowedRoleIds: ids })}
                        roles={roles}
                        selected={slot.allowedRoleIds}
                      />
                    </div>
                  )}
                >
                  <div className={styles.addSlotPanel}>
                    <h4>Add another role slot</h4>
                    <p>Use a new card for each class, role, flex group or signup bucket you need.</p>
                    <Button onClick={addSlot} type="button" variant="secondary"><Plus size={16} aria-hidden="true" />Add slot</Button>
                  </div>
                </SortableSlotGrid>
              )}
            </section>
          ) : null}

          {stepIndex === 3 ? (
            <section className={`${styles.createSection} ${styles.createSectionMedium}`}>
              <div className={styles.createSectionIntro}>
                <span className={overviewStyles.eyebrow}>Permissions & Post setup</span>
                <h3>Draft metadata for future publication</h3>
                <p>Stored only where Prisma already supports the data. No Discord message, thread or sync job is created.</p>
              </div>
              <div className={styles.postSetupGrid}>
                <div className={styles.setupPanel}>
                  <div className={styles.setupPanelHeader}>
                    <Hash size={18} aria-hidden="true" />
                    <div><h4>Target channel</h4><p>Optional draft metadata for future publishing.</p></div>
                  </div>
                  <div className={styles.segmentControl}>
                    <button aria-pressed={channelMode === "select"} disabled={!channels.length} onClick={() => setChannelMode("select")} type="button">Select menu</button>
                    <button aria-pressed={channelMode === "manual"} onClick={() => setChannelMode("manual")} type="button">Manual entry</button>
                  </div>
                  {channelMode === "select" && channels.length ? (
                    <div>
                      <div className={styles.fieldHeading}>Channel</div>
                      <ChannelSelect channels={channels} emptyText="No postable channels loaded" onChange={setChannelId} value={channelId} />
                    </div>
                  ) : channelMode === "select" ? (
                    <p className={overviewStyles.formHint}>{channelLoadError ?? "No postable channels could be loaded. Use manual entry."}</p>
                  ) : null}
                  {channelMode === "manual" ? (
                    <div className={styles.advancedChannelBox}>
                      <p>Use manual channel ID only if the channel is missing from the list.</p>
                      <label>
                        Manual channel ID fallback
                        <input inputMode="numeric" maxLength={32} onChange={(event) => setManualChannelId(event.target.value)} placeholder="Discord channel ID" value={manualChannelId} />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className={`${styles.setupPanel} ${styles.advancedPanel}`}>
                  <div className={styles.setupPanelHeader}>
                    <Shield size={18} aria-hidden="true" />
                    <div><h4>Advanced restrictions</h4><p>Restrict event-level signup access before slot-level rules.</p></div>
                  </div>
                  <button className={styles.advancedSummary} onClick={() => setAccessRestrictionsOpen((current) => !current)} type="button">
                    <span>{accessRestrictionEnabled ? `${accessRoleIds.length} access roles selected` : "Event-level access is open"}</span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  {accessRoleIds.length ? (
                    <div className={selectorStyles.selectedRoleChips}>
                      {accessRoleIds.slice(0, 6).map((roleId) => (
                        <span key={roleId}>{roleName(roleId)}</span>
                      ))}
                      {accessRoleIds.length > 6 ? <span>+{accessRoleIds.length - 6}</span> : null}
                    </div>
                  ) : null}
                  {accessRestrictionsOpen ? (
                    <div className={styles.advancedChannelBox}>
                      <label className={overviewStyles.checkField}>
                        <input checked={accessRestrictionEnabled} onChange={(event) => {
                          setAccessRestrictionEnabled(event.target.checked);
                          if (!event.target.checked) {
                            setAccessRoleIds([]);
                          }
                        }} type="checkbox" />
                        Restrict this event by Discord roles
                      </label>
                      {accessRestrictionEnabled ? (
                        <RoleMultiSelect emptyText="No roles loaded. Event-level access can be configured later." label="Access roles" loadError={roleLoadError} onChange={setAccessRoleIds} roles={roles} selected={accessRoleIds} />
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className={`${styles.setupPanel} ${styles.mentionPanel}`}>
                  <div className={styles.setupPanelHeader}>
                    <Check size={18} aria-hidden="true" />
                    <div><h4>Future publication mentions</h4><p>Stored as notify targets for later publish flows.</p></div>
                  </div>
                  <div className={styles.segmentControl}>
                    <button aria-pressed={mentionMode === "none"} onClick={() => setMentionMode("none")} type="button">No mention</button>
                    <button aria-pressed={mentionMode === "roles"} onClick={() => setMentionMode("roles")} type="button">Selected roles</button>
                  </div>
                  {mentionMode === "roles" ? (
                    <RoleMultiSelect emptyText="No roles loaded. Mentions will remain empty." label="Mention roles" loadError={roleLoadError} onChange={setNotifyRoleIds} roles={roles} selected={notifyRoleIds} />
                  ) : (
                    <p className={styles.inlineHelp}>No role pings will be stored for future publication.</p>
                  )}
                </div>

                <div className={styles.setupPanel}>
                  <div className={styles.setupPanelHeader}>
                    <LayoutTemplate size={18} aria-hidden="true" />
                    <div><h4>Recap thread config</h4><p>Configuration only. The web creator does not create threads.</p></div>
                  </div>
                  <label className={overviewStyles.checkField}>
                    <input checked={recapEnabled} onChange={(event) => setRecapEnabled(event.target.checked)} type="checkbox" />
                    Enable recap config
                  </label>
                  {recapEnabled ? (
                    <div className={styles.setupInlineGrid}>
                      <label>Minutes before expiry<input max={1440} min={0} onChange={(event) => setRecapMinutes(Number(event.target.value))} type="number" value={recapMinutes} /></label>
                      <label>Recap message<input maxLength={1000} onChange={(event) => setRecapMessage(event.target.value)} value={recapMessage} /></label>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {stepIndex === 4 ? (
            <section className={`${styles.createSection} ${styles.createSectionCompact}`}>
              <div className={styles.createSectionIntro}>
                <span className={overviewStyles.eyebrow}>Review</span>
                <h3>Draft summary</h3>
                <p>Review the database-only draft. The create action stores Prisma records and leaves Discord untouched.</p>
              </div>
              <div className={styles.reviewGrid}>
                <div className={styles.reviewHero}>
                  <span className={`${overviewStyles.status} ${overviewStyles.statusDraft}`}>Draft / Not published</span>
                  <h3>{name || "Untitled event"}</h3>
                  <p>{type} - {eventType} - {date} {time} {timezone}</p>
                </div>
                <div className={styles.reviewTile}><CalendarClock size={18} aria-hidden="true" /><strong>{duration} min</strong><span>Duration</span></div>
                <div className={styles.reviewTile}><LayoutTemplate size={18} aria-hidden="true" /><strong>{slotCount || "No"} {isPve ? "options" : "slots"}</strong><span>{isPve ? `${pveCapacity} total capacity` : mode === "template" ? selectedTemplate?.name ?? "Template missing" : `${totalCapacity ?? 0} capacity`}</span></div>
                <div className={styles.reviewTile}><Shield size={18} aria-hidden="true" /><strong>{accessRestrictionEnabled && accessRoleIds.length ? accessRoleIds.length : "Open"}</strong><span>{accessRestrictionEnabled ? "Advanced access restriction" : "No event-level restriction"}</span></div>
                <div className={styles.reviewTile}><Hash size={18} aria-hidden="true" /><strong>{selectedChannel ? `#${selectedChannel.name}` : finalChannelId ? "Manual ID" : "Not set"}</strong><span>{channelMode === "manual" ? finalChannelId ?? "Manual entry" : finalChannelId ?? "Target channel"}</span></div>
                <div className={styles.reviewTile}><Check size={18} aria-hidden="true" /><strong>{recurrence === "weekly" ? "Weekly" : "Single"}</strong><span>{mentionMode === "roles" ? `${notifyRoleIds.length} mention roles` : "No mention"}</span></div>
                <div className={styles.reviewList}>
                  <h4>{isPve ? "PvE options order" : mode === "template" ? "Template slots" : "Manual slots order"}</h4>
                  {isPve ? (
                    pveOptions.map((option, index) => (
                      <p key={option.id}><strong>{index + 1}. {option.label}</strong><span>{option.time} - capacity {option.capacity}</span></p>
                    ))
                  ) : mode === "template" ? (
                    <p><strong>{selectedTemplate?.name ?? "No template selected"}</strong><span>{selectedTemplate?.slotCount ?? 0} slots will be copied from the template.</span></p>
                  ) : (
                    manualSlots.map((slot, index) => (
                      <p key={slot.id}><strong>{index + 1}. {slot.name || "Unnamed slot"}</strong><span>{slot.max} capacity{slot.allowedRoleIds.length ? ` - ${slot.allowedRoleIds.map(roleName).join(", ")}` : ""}</span></p>
                    ))
                  )}
                </div>
                <div className={styles.reviewList}>
                  <h4>Roles</h4>
                  <p><strong>Access</strong><span>{accessRestrictionEnabled && accessRoleIds.length ? accessRoleIds.map(roleName).join(", ") : "Open to current event flow rules"}</span></p>
                  <p><strong>Mentions</strong><span>{mentionMode === "roles" && notifyRoleIds.length ? notifyRoleIds.map(roleName).join(", ") : "No role mentions"}</span></p>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className={styles.createFooter}>
          <Button disabled={stepIndex === 0 || busy} onClick={goBack} type="button" variant="ghost">
            <ChevronLeft size={16} aria-hidden="true" />
            Back
          </Button>
          <div className={overviewStyles.quickActions}>
            <Button href={guildRoutes.events(guildId)} variant="ghost">Cancel</Button>
            {stepIndex < steps.length - 1 ? (
              <Button onClick={goNext} type="button" variant="secondary">
                Next
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            ) : (
              <Button disabled={!canSubmit} type="submit">
                <Plus size={16} aria-hidden="true" />
                {busy ? "Creating..." : "Create draft event"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </form>
  );
}

