"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { SortableSlotGrid } from "@/components/dashboard/slots/SortableSlotGrid";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { sortSlotsByOrder } from "@/lib/slotOrdering";
import { EmojiPicker } from "../../EmojiPicker";
import { ParticipantChip, type ParticipantChipData } from "../../ParticipantChip";
import { SlotEmoji } from "../../SlotEmoji";
import styles from "../../overview.module.css";

type EventSlot = {
  id: string;
  name: string;
  max: number;
  position: number;
  emoji: string | null;
  emojiSource: string | null;
  participants: ParticipantChipData[];
};

type EventSlotGridProps = {
  guildId: string;
  eventId: string;
  manageable: boolean;
  slots: EventSlot[];
};

async function submitJson(url: string, method: "PATCH" | "POST" | "DELETE", body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(json?.error ?? "Slot update failed.");
  }
}

function formToSlotPayload(form: HTMLFormElement) {
  const formData = new FormData(form);

  return {
    name: formData.get("name"),
    max: formData.get("max"),
    position: formData.get("position"),
    emoji: formData.get("emoji"),
    emojiSource: formData.get("emojiSource")
  };
}

export function EventSlotGrid({ guildId, eventId, manageable, slots }: EventSlotGridProps) {
  const router = useRouter();
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const baseUrl = `/api/guilds/${guildId}/events/${eventId}/slots`;
  const [localSlots, setLocalSlots] = useState(() => sortSlotsByOrder(slots));
  const sortedSlots = sortSlotsByOrder(localSlots);
  const dragDisabled = !manageable || busy || adding || editingSlotId !== null;

  useEffect(() => {
    setLocalSlots(sortSlotsByOrder(slots));
  }, [slots]);

  const saveSlot = async (slotId: string, formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!manageable) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await submitJson(`${baseUrl}/${slotId}`, "PATCH", formToSlotPayload(formEvent.currentTarget));
      setMessage("Slot updated. Discord message sync pending.");
      setEditingSlotId(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Slot update failed.");
    } finally {
      setBusy(false);
    }
  };

  const createSlot = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!manageable) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await submitJson(baseUrl, "POST", formToSlotPayload(formEvent.currentTarget));
      setMessage("Slot added. Discord message sync pending.");
      setAdding(false);
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
      await submitJson(`${baseUrl}/${slotId}`, "DELETE");
      setMessage("Slot deleted. Discord message sync pending.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Slot deletion failed.");
    } finally {
      setBusy(false);
    }
  };

  const persistOrder = async (nextSlots: EventSlot[]) => {
    if (dragDisabled) {
      return;
    }

    const previousSlots = sortedSlots;
    const reorderedSlots = nextSlots.map((slot, index) => ({ ...slot, position: index + 1 }));
    setLocalSlots(reorderedSlots);
    setMessage("Saving order...");

    try {
      const response = await fetch(`${baseUrl}/reorder`, {
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
        <Button disabled={!manageable || busy} onClick={() => setAdding((current) => !current)} type="button" variant="secondary">
          <Plus size={16} aria-hidden="true" />
          Add slot
        </Button>
      </div>
      {!manageable ? (
        <p className={styles.formHint}>
          <Lock size={14} aria-hidden="true" />
          Slot edits require owner, administrator, or manage guild permissions.
        </p>
      ) : null}
      {message ? <p className={styles.formNotice}>{message}</p> : null}
      {adding ? (
        <Card className={`${styles.slotCardCompact} ${styles.slotCardEditing}`}>
          <form className={styles.compactForm} onSubmit={(event) => void createSlot(event)}>
            <label>Name<input name="name" required maxLength={80} placeholder="Flame" /></label>
            <label>Capacity<input name="max" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="1" /></label>
            {/* Future: drag-and-drop ordering using @dnd-kit. */}
            <label>Display order<input className={styles.orderInput} name="position" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={String(sortedSlots.length)} /><small>Slots are rendered left to right by order.</small></label>
            <EmojiPicker guildId={guildId} />
            <div className={`${styles.quickActions} ${styles.editorActions}`}>
              <Button disabled={busy} type="submit">Create slot</Button>
              <Button disabled={busy} onClick={() => setAdding(false)} type="button" variant="ghost">Cancel</Button>
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
                    <span>{slot.participants.length}/{slot.max}</span>
                  </div>
                </div>
                {slot.participants.length ? (
                  <div className={styles.participantList}>
                    {slot.participants.map((participant) => (
                      <ParticipantChip key={participant.id} participant={participant} removable />
                    ))}
                  </div>
                ) : (
                  <p>No participants in this slot yet.</p>
                )}
                <div className={styles.quickActions}>
                  <Button disabled type="button" variant="ghost">+ Add</Button>
                  <Button disabled={!manageable || busy} onClick={() => setEditingSlotId(slot.id)} type="button" variant="ghost"><Pencil size={14} aria-hidden="true" />Edit</Button>
                  <Button disabled={!manageable || busy || slot.participants.length > 0} onClick={() => void deleteSlot(slot.id)} title={slot.participants.length > 0 ? "Slots with participants cannot be deleted safely." : undefined} type="button" variant="ghost"><Trash2 size={14} aria-hidden="true" />Delete</Button>
                </div>
              </>
            )}
          </Card>
        )}
      />
    </div>
  );
}
