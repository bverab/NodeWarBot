"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsUpDown, LayoutTemplate, Plus, Shield, Trash2 } from "lucide-react";
import { SortableSlotGrid } from "@/components/dashboard/slots/SortableSlotGrid";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { EmojiPicker } from "../../EmojiPicker";
import { SlotEmoji } from "../../SlotEmoji";
import overviewStyles from "../../overview.module.css";
import createStyles from "../../events/new/EventCreate.module.css";
import { RoleMultiSelect, type RoleOption } from "../../events/new/NewEventForm";

type TemplateSlot = {
  id: string;
  name: string;
  max: number;
  position: number;
  emoji: string;
  emojiSource: string;
  allowedRoleIds: string[];
};

type NewTemplateFormProps = {
  guildId: string;
  roles: RoleOption[];
};

const steps = ["Basics", "Slots", "Review"] as const;
const templateTypes = [
  { value: "war", label: "War", defaultType: "Evento de guerra" },
  { value: "siege", label: "Siege", defaultType: "Evento de asedio" },
  { value: "10v10", label: "10x10", defaultType: "Evento 10v10" }
];

function makeSlot(position: number): TemplateSlot {
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

async function createTemplate(guildId: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/guilds/${guildId}/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = (await response.json().catch(() => null)) as { templateId?: string; error?: string } | null;

  if (!response.ok || !json?.templateId) {
    throw new Error(json?.error ?? "Template creation failed.");
  }

  return json.templateId;
}

export function NewTemplateForm({ guildId, roles }: NewTemplateFormProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("war");
  const [typeDefault, setTypeDefault] = useState("Evento de guerra");
  const [time, setTime] = useState("");
  const [timezone, setTimezone] = useState("America/Bogota");
  const [slots, setSlots] = useState<TemplateSlot[]>([makeSlot(1)]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const totalCapacity = slots.reduce((total, slot) => total + slot.max, 0);
  const roleName = (roleId: string) => roles.find((role) => role.id === roleId)?.name ?? roleId;

  const canContinue = useMemo(() => {
    if (stepIndex === 0) {
      return name.trim().length >= 2 && eventType && typeDefault.trim() && timezone.trim();
    }

    if (stepIndex === 1) {
      return slots.length > 0 && slots.every((slot) => slot.name.trim() && slot.max > 0);
    }

    return true;
  }, [eventType, name, slots, stepIndex, timezone, typeDefault]);

  const setEventTypeWithDefaults = (value: string) => {
    setEventType(value);
    setTypeDefault(templateTypes.find((item) => item.value === value)?.defaultType ?? "Evento");
  };

  const addSlot = () => setSlots((current) => [...current, makeSlot(current.length + 1)]);
  const removeSlot = (slotId: string) => setSlots((current) => current.filter((slot) => slot.id !== slotId).map((slot, index) => ({ ...slot, position: index + 1 })));
  const updateSlot = (slotId: string, patch: Partial<TemplateSlot>) => setSlots((current) => current.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  const moveSlot = (slotId: string, direction: -1 | 1) => {
    setSlots((current) => {
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const templateId = await createTemplate(guildId, {
        name,
        eventType,
        typeDefault,
        timezone,
        time: time.trim() || null,
        slots: slots.map((slot, index) => ({
          name: slot.name,
          max: slot.max,
          position: index,
          emoji: slot.emoji || null,
          emojiSource: slot.emojiSource || null,
          allowedRoleIds: slot.allowedRoleIds
        }))
      });
      router.push(guildRoutes.templateDetail(guildId, templateId));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template creation failed.");
      setBusy(false);
    }
  };

  return (
    <form className={createStyles.createEventForm} onSubmit={(event) => void submit(event)}>
      <Card className={createStyles.createEventCard}>
        <div className={createStyles.createMetaBar}>
          <div>
            <span className={overviewStyles.eyebrow}>Template builder</span>
            <h2>Create template</h2>
            <p>Build reusable role slots and slot restrictions. No Discord message is created.</p>
          </div>
          <span className={`${overviewStyles.status} ${overviewStyles.statusOpen}`}>Active template</span>
        </div>

        <div className={createStyles.createStepper}>
          {steps.map((step, index) => (
            <button aria-current={index === stepIndex ? "step" : undefined} key={step} onClick={() => index <= stepIndex && setStepIndex(index)} type="button">
              <span>{index + 1}</span>
              {step}
            </button>
          ))}
        </div>

        {message ? <p className={overviewStyles.formNotice}>{message}</p> : null}

        <div className={createStyles.createPanel}>
          {stepIndex === 0 ? (
            <section className={`${createStyles.createSection} ${createStyles.createSectionCompact}`}>
              <div className={createStyles.createSectionIntro}>
                <span className={overviewStyles.eyebrow}>Basics</span>
                <h3>Template identity</h3>
                <p>Set the reusable defaults that appear when creating draft events from this template.</p>
              </div>
              <div className={createStyles.createFields}>
                <label className={createStyles.fieldLarge}>Template name<input maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} /></label>
                <label>Template type<select onChange={(event) => setEventTypeWithDefaults(event.target.value)} value={eventType}>{templateTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                <label>Default label<input maxLength={64} onChange={(event) => setTypeDefault(event.target.value)} required value={typeDefault} /></label>
                <label>Default time<input onChange={(event) => setTime(event.target.value)} type="time" value={time} /></label>
                <label className={createStyles.fieldLarge}>Timezone<input maxLength={64} onChange={(event) => setTimezone(event.target.value)} required value={timezone} /></label>
              </div>
            </section>
          ) : null}

          {stepIndex === 1 ? (
            <section className={`${createStyles.createSection} ${createStyles.createSectionFull}`}>
              <div className={createStyles.createSectionIntro}>
                <span className={overviewStyles.eyebrow}>Slots</span>
                <h3>Reusable role slots</h3>
                <p>Define the role structure, icons, capacity and allowed Discord roles copied into future events.</p>
              </div>
              <SortableSlotGrid
                className={createStyles.manualSlotList}
                items={slots}
                onReorder={(items) => setSlots(items.map((slot, index) => ({ ...slot, position: index + 1 })))}
                renderItem={(slot, index, dragHandle) => (
                  <div className={createStyles.manualSlotPanel} key={slot.id}>
                    <div className={createStyles.manualSlotHeader}>
                      <div>
                        <span className={overviewStyles.eyebrow}>Slot {index + 1}</span>
                        <h4><SlotEmoji value={slot.emoji} />{slot.name || "Unnamed slot"}</h4>
                      </div>
                      <div className={createStyles.orderControls}>
                        <span><ChevronsUpDown size={14} aria-hidden="true" />Order</span>
                        {dragHandle}
                        <button disabled={index === 0} onClick={() => moveSlot(slot.id, -1)} title="Move up" type="button">Up</button>
                        <button disabled={index === slots.length - 1} onClick={() => moveSlot(slot.id, 1)} title="Move down" type="button">Down</button>
                        <Button disabled={slots.length <= 1} onClick={() => removeSlot(slot.id)} type="button" variant="ghost"><Trash2 size={16} aria-hidden="true" />Remove</Button>
                      </div>
                    </div>
                    <div className={createStyles.slotConfigGrid}>
                      <label>Name<input maxLength={80} onChange={(event) => updateSlot(slot.id, { name: event.target.value })} required value={slot.name} /></label>
                      <label>Capacity<input max={100} min={1} onChange={(event) => updateSlot(slot.id, { max: Number(event.target.value) })} required type="number" value={slot.max} /></label>
                      <label className={createStyles.fieldLarge}>Icon<EmojiPicker guildId={guildId} name={`template-slot-${slot.id}-emoji`} onChange={(value, source) => updateSlot(slot.id, { emoji: value, emojiSource: source })} source={slot.emojiSource} value={slot.emoji} /></label>
                    </div>
                    <RoleMultiSelect
                      emptyText="No roles could be loaded. You can still create the template and configure permissions later."
                      label="Allowed roles for this slot"
                      onChange={(ids) => updateSlot(slot.id, { allowedRoleIds: ids })}
                      roles={roles}
                      selected={slot.allowedRoleIds}
                    />
                  </div>
                )}
              >
                <div className={createStyles.addSlotPanel}>
                  <h4>Add another role slot</h4>
                  <p>Use one card for each class, role, flex group or signup bucket.</p>
                  <Button onClick={addSlot} type="button" variant="secondary"><Plus size={16} aria-hidden="true" />Add slot</Button>
                </div>
              </SortableSlotGrid>
            </section>
          ) : null}

          {stepIndex === 2 ? (
            <section className={`${createStyles.createSection} ${createStyles.createSectionCompact}`}>
              <div className={createStyles.createSectionIntro}>
                <span className={overviewStyles.eyebrow}>Review</span>
                <h3>Template summary</h3>
                <p>This creates an active database template. Discord is not touched.</p>
              </div>
              <div className={createStyles.reviewGrid}>
                <div className={createStyles.reviewHero}>
                  <span className={`${overviewStyles.status} ${overviewStyles.statusOpen}`}>Active template</span>
                  <h3>{name || "Untitled template"}</h3>
                  <p>{typeDefault} - {eventType} - {time || "No default time"} - {timezone}</p>
                </div>
                <div className={createStyles.reviewTile}><LayoutTemplate size={18} aria-hidden="true" /><strong>{slots.length} slots</strong><span>{totalCapacity} total capacity</span></div>
                <div className={createStyles.reviewTile}><Shield size={18} aria-hidden="true" /><strong>{slots.reduce((total, slot) => total + slot.allowedRoleIds.length, 0)}</strong><span>Slot role restrictions</span></div>
                <div className={createStyles.reviewList}>
                  <h4>Slots order</h4>
                  {slots.map((slot, index) => (
                    <p key={slot.id}><strong>{index + 1}. {slot.name || "Unnamed slot"}</strong><span>{slot.max} capacity{slot.allowedRoleIds.length ? ` - ${slot.allowedRoleIds.map(roleName).join(", ")}` : " - open slot"}</span></p>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className={createStyles.createFooter}>
          <Button disabled={stepIndex === 0 || busy} onClick={() => setStepIndex((current) => Math.max(0, current - 1))} type="button" variant="ghost"><ChevronLeft size={16} aria-hidden="true" />Back</Button>
          <div className={overviewStyles.quickActions}>
            <Button href={guildRoutes.templates(guildId)} variant="ghost">Cancel</Button>
            {stepIndex < steps.length - 1 ? (
              <Button disabled={!canContinue || busy} onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))} type="button" variant="secondary">Next<ChevronRight size={16} aria-hidden="true" /></Button>
            ) : (
              <Button disabled={!canContinue || busy} type="submit"><Plus size={16} aria-hidden="true" />{busy ? "Creating..." : "Create template"}</Button>
            )}
          </div>
        </div>
      </Card>
    </form>
  );
}
