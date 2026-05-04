"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { SortableSlotGrid } from "@/components/dashboard/slots/SortableSlotGrid";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { sortSlotsByOrder } from "@/lib/slotOrdering";
import { EmojiPicker } from "../../EmojiPicker";
import { SlotEmoji } from "../../SlotEmoji";
import styles from "../../overview.module.css";

type TemplateSlot = {
  id: string;
  name: string;
  max: number;
  position: number;
  emoji: string | null;
  emojiSource: string | null;
  permissions: Array<{
    id: string;
    discordRoleId: string | null;
    discordRoleName: string | null;
  }>;
};

type TemplateVisualEditorProps = {
  guildId: string;
  templateId: string;
  manageable: boolean;
  template: {
    name: string;
    eventType: string;
    typeDefault: string;
    timezone: string;
    time: string | null;
    duration: number;
    closeBeforeMinutes: number;
    isArchived: boolean;
    roleSlots: TemplateSlot[];
    notifyTargets: Array<{ id: string; targetId: string; position: number }>;
  };
};

async function submitJson(url: string, method: "PATCH" | "POST" | "DELETE", body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(json?.error ?? "Template update failed.");
  }
}

function formToObject(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}

export function TemplateVisualEditor({ guildId, templateId, manageable, template }: TemplateVisualEditorProps) {
  const router = useRouter();
  const [editingBasics, setEditingBasics] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [addingSlot, setAddingSlot] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const baseUrl = `/api/guilds/${guildId}/templates/${templateId}`;
  const [localSlots, setLocalSlots] = useState(() => sortSlotsByOrder(template.roleSlots));
  const sortedSlots = sortSlotsByOrder(localSlots);
  const dragDisabled = !manageable || busy || addingSlot || editingSlotId !== null;

  useEffect(() => {
    setLocalSlots(sortSlotsByOrder(template.roleSlots));
  }, [template.roleSlots]);

  const saveBasics = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manageable) {
      return;
    }

    const payload = formToObject(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      await submitJson(baseUrl, "PATCH", {
        ...payload,
        isArchived: payload.isArchived === "on"
      });
      setMessage("Template updated.");
      setEditingBasics(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template update failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveSlot = async (slotId: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manageable) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await submitJson(`${baseUrl}/slots/${slotId}`, "PATCH", formToObject(event.currentTarget));
      setMessage("Template slot updated.");
      setEditingSlotId(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Slot update failed.");
    } finally {
      setBusy(false);
    }
  };

  const createSlot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manageable) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await submitJson(`${baseUrl}/slots`, "POST", formToObject(event.currentTarget));
      setMessage("Template slot added.");
      setAddingSlot(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Slot creation failed.");
    } finally {
      setBusy(false);
    }
  };

  const deleteSlot = async (slotId: string) => {
    if (!manageable) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await submitJson(`${baseUrl}/slots/${slotId}`, "DELETE");
      setMessage("Template slot deleted.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Slot deletion failed.");
    } finally {
      setBusy(false);
    }
  };

  const persistOrder = async (nextSlots: TemplateSlot[]) => {
    if (dragDisabled) {
      return;
    }

    const previousSlots = sortedSlots;
    const reorderedSlots = nextSlots.map((slot, index) => ({ ...slot, position: index + 1 }));
    setLocalSlots(reorderedSlots);
    setMessage("Saving order...");

    try {
      const response = await fetch(`${baseUrl}/slots/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: reorderedSlots.map((slot) => ({ id: slot.id, order: slot.position }))
        })
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Failed to save slot order.");
      }

      setMessage("Order saved.");
    } catch (error) {
      setLocalSlots(previousSlots);
      setMessage(error instanceof Error ? error.message : "Failed to save slot order.");
    }
  };

  return (
    <div className={styles.slotEditorStack}>
      <div className={styles.quickActions}>
        <Button disabled={!manageable || busy} onClick={() => setEditingBasics((current) => !current)} type="button" variant="secondary">
          <Pencil size={16} aria-hidden="true" />
          Edit template basics
        </Button>
        <Button disabled={!manageable || busy} onClick={() => setAddingSlot((current) => !current)} type="button" variant="secondary">
          <Plus size={16} aria-hidden="true" />
          Add slot
        </Button>
      </div>
      {!manageable ? (
        <p className={styles.formHint}>
          <Lock size={14} aria-hidden="true" />
          Template edits require owner, administrator, or manage guild permissions.
        </p>
      ) : null}
      {message ? <p className={styles.formNotice}>{message}</p> : null}

      {editingBasics ? (
        <Card>
          <form className={styles.compactForm} onSubmit={(event) => void saveBasics(event)}>
            <label>Name<input defaultValue={template.name} name="name" required maxLength={120} /></label>
            <label>Event type<input defaultValue={template.eventType} name="eventType" maxLength={32} /></label>
            <label>Default label<input defaultValue={template.typeDefault} name="typeDefault" maxLength={64} /></label>
            <label>Time<input defaultValue={template.time ?? ""} name="time" pattern="\\d{1,2}:\\d{2}" placeholder="20:00" /></label>
            <label>Timezone<input defaultValue={template.timezone} name="timezone" maxLength={64} /></label>
            <label>Duration<input defaultValue={template.duration} name="duration" type="number" min={1} max={1440} /></label>
            <label>Close before expiry<input defaultValue={template.closeBeforeMinutes} name="closeBeforeMinutes" type="number" min={0} max={1440} /></label>
            <label className={styles.checkField}><input defaultChecked={template.isArchived} name="isArchived" type="checkbox" /> Archived</label>
            <div className={styles.quickActions}>
              <Button disabled={busy} type="submit">Save template</Button>
              <Button disabled={busy} onClick={() => setEditingBasics(false)} type="button" variant="ghost">Cancel</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {addingSlot ? (
        <Card className={`${styles.slotCardCompact} ${styles.slotCardEditing}`}>
          <form className={styles.compactForm} onSubmit={(event) => void createSlot(event)}>
            <label>Name<input name="name" required maxLength={80} /></label>
            <label>Capacity<input name="max" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="1" /></label>
            {/* Future: drag-and-drop ordering using @dnd-kit. */}
            <label>Display order<input className={styles.orderInput} name="position" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={String(sortedSlots.length)} /><small>Slots are rendered left to right by order.</small></label>
            <EmojiPicker guildId={guildId} />
            <div className={`${styles.quickActions} ${styles.editorActions}`}>
              <Button disabled={busy} type="submit">Create slot</Button>
              <Button disabled={busy} onClick={() => setAddingSlot(false)} type="button" variant="ghost">Cancel</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <SortableSlotGrid
        className={styles.slotGrid}
        disabled={dragDisabled}
        getItemClassName={(slot) => (editingSlotId === slot.id ? styles.sortableItemEditing : "")}
        items={sortedSlots}
        onReorder={(nextSlots) => void persistOrder(nextSlots)}
        renderItem={(slot, index, dragHandle) => (
          <Card className={`${styles.slotCardCompact} ${editingSlotId === slot.id ? styles.slotCardEditing : ""}`} key={slot.id}>
            {editingSlotId === slot.id ? (
              <form className={styles.compactForm} onSubmit={(event) => void saveSlot(slot.id, event)}>
                <label>Name<input defaultValue={slot.name} name="name" required maxLength={80} /></label>
                <label>Capacity<input defaultValue={String(slot.max)} name="max" type="text" inputMode="numeric" pattern="[0-9]*" /></label>
                <label>Display order<input className={styles.orderInput} defaultValue={String(slot.position)} name="position" type="text" inputMode="numeric" pattern="[0-9]*" /><small>Slots are rendered left to right by order.</small></label>
                <EmojiPicker guildId={guildId} defaultValue={slot.emoji} defaultSource={slot.emojiSource} />
                <div className={`${styles.quickActions} ${styles.editorActions}`}>
                  <Button disabled={busy} type="submit">Save</Button>
                  <Button disabled={busy} onClick={() => setEditingSlotId(null)} type="button" variant="ghost">Cancel</Button>
                </div>
              </form>
            ) : (
              <>
                <div className={styles.slotHeader}>
                  <h3><SlotEmoji value={slot.emoji} />{slot.name}</h3>
                  <div className={styles.slotMeta}>
                    {dragHandle}
                    <span className={styles.orderBadge}>#{index + 1}</span>
                    <span>0/{slot.max}</span>
                  </div>
                </div>
                <p>Position {slot.position + 1}. Emoji source: {slot.emojiSource ?? "Not set"}.</p>
                {slot.permissions.length ? (
                  <div className={styles.participantList}>
                    {slot.permissions.map((permission) => (
                      <span className={styles.pill} key={permission.id}>{permission.discordRoleName ?? "Restricted role"}</span>
                    ))}
                  </div>
                ) : <p>No role permissions configured for this slot.</p>}
                <div className={styles.quickActions}>
                  <Button disabled={!manageable || busy} onClick={() => setEditingSlotId(slot.id)} type="button" variant="ghost"><Pencil size={14} aria-hidden="true" />Edit</Button>
                  <Button disabled={!manageable || busy} onClick={() => void deleteSlot(slot.id)} type="button" variant="ghost"><Trash2 size={14} aria-hidden="true" />Delete</Button>
                </div>
              </>
            )}
          </Card>
        )}
      />
    </div>
  );
}
