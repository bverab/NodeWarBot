"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { SortableSlotGrid } from "@/components/dashboard/slots/SortableSlotGrid";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { sortSlotsByOrder } from "@/lib/slotOrdering";
import { EmojiPicker } from "@/app/guilds/[guildId]/_components/emoji/EmojiPicker";
import { ParticipantChip, type ParticipantChipData } from "@/app/guilds/[guildId]/_components/shared/ParticipantChip";
import { SlotEmoji } from "@/app/guilds/[guildId]/_components/shared/SlotEmoji";
import { RoleMultiSelect, type RoleOption } from "@/app/guilds/[guildId]/events/new/NewEventForm";
import styles from "@/app/guilds/[guildId]/_styles/overview.module.css";

type EventSlot = {
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
  participants: ParticipantChipData[];
};

type EventSlotGridProps = {
  guildId: string;
  eventId: string;
  isRecurring: boolean;
  manageable: boolean;
  roles: RoleOption[];
  roleLoadError?: string | null;
  slots: EventSlot[];
};

type SlotMutationResponse = {
  event?: {
    roleSlots?: EventSlot[];
  };
  error?: string;
};

async function submitJson(url: string, method: "PATCH" | "POST" | "DELETE", body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = (await response.json().catch(() => null)) as SlotMutationResponse | null;

  if (!response.ok) {
    throw new Error(json?.error ?? "Slot update failed.");
  }

  return json;
}

function formToSlotPayload(form: HTMLFormElement, allowedRoleIds?: string[], recurrenceScope?: "single" | "series") {
  const formData = new FormData(form);

  const payload: Record<string, unknown> = {
    name: formData.get("name"),
    max: formData.get("max"),
    position: formData.get("position"),
    emoji: formData.get("emoji"),
    emojiSource: formData.get("emojiSource")
  };

  if (allowedRoleIds) {
    payload.allowedRoleIds = allowedRoleIds;
  }
  if (recurrenceScope) {
    payload.recurrenceScope = recurrenceScope;
  }

  return payload;
}

export function EventSlotGrid({ guildId, eventId, isRecurring, manageable, roles, roleLoadError, slots }: EventSlotGridProps) {
  const router = useRouter();
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, string[]>>({});
  const [permissionTouched, setPermissionTouched] = useState<Record<string, boolean>>({});
  const [recurrenceConfirmOpen, setRecurrenceConfirmOpen] = useState(false);
  const [pendingSlotSave, setPendingSlotSave] = useState<{ slotId: string; payload: Record<string, unknown> } | null>(null);
  const [deleteSlotId, setDeleteSlotId] = useState<string | null>(null);
  const baseUrl = `/api/guilds/${guildId}/events/${eventId}/slots`;
  const [localSlots, setLocalSlots] = useState(() => sortSlotsByOrder(slots));
  const sortedSlots = sortSlotsByOrder(localSlots);
  const dragDisabled = !manageable || busy || adding || editingSlotId !== null;
  const roleName = (roleId: string) => roles.find((role) => role.id === roleId)?.name ?? roleId;
  const applyEventSlots = (response: SlotMutationResponse | null) => {
    if (response?.event?.roleSlots) {
      setLocalSlots(sortSlotsByOrder(response.event.roleSlots));
    }
  };

  useEffect(() => {
    setLocalSlots(sortSlotsByOrder(slots));
  }, [slots]);

  const setEditingSlot = (slot: EventSlot | null) => {
    setEditingSlotId(slot?.id ?? null);
    if (slot) {
      setPermissionDrafts((current) => ({
        ...current,
        [slot.id]: current[slot.id] ?? slot.allowedRoleIds
      }));
    }
  };

  const updateSlotPermissions = (slotId: string, roleIds: string[]) => {
    setPermissionDrafts((current) => ({ ...current, [slotId]: roleIds }));
    setPermissionTouched((current) => ({ ...current, [slotId]: true }));
  };

  const saveSlotPayload = async (slotId: string, payload: Record<string, unknown>, recurrenceScope: "single" | "series" = "single") => {
    if (!manageable) {
      return;
    }
    if (busy) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await submitJson(
        `${baseUrl}/${slotId}`,
        "PATCH",
        { ...payload, recurrenceScope }
      );
      applyEventSlots(response);
      setPendingSlotSave(null);
      setRecurrenceConfirmOpen(false);
      setMessage("Slot updated. Discord message sync pending.");
      setEditingSlot(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Slot update failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveSlot = async (slotId: string, formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const payload = formToSlotPayload(formEvent.currentTarget, permissionTouched[slotId] ? permissionDrafts[slotId] ?? [] : undefined);
    if (isRecurring) {
      setPendingSlotSave({ slotId, payload });
      setRecurrenceConfirmOpen(true);
      return;
    }

    await saveSlotPayload(slotId, payload, "single");
  };

  const createSlot = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!manageable) {
      return;
    }
    if (busy) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await submitJson(baseUrl, "POST", formToSlotPayload(formEvent.currentTarget));
      applyEventSlots(response);
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
    if (busy) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await submitJson(`${baseUrl}/${slotId}`, "DELETE");
      applyEventSlots(response);
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
      {!manageable ? (
        <p className={styles.formHint}>
          <Lock size={14} aria-hidden="true" />
          Slot edits require owner, administrator, or manage guild permissions.
        </p>
      ) : null}
      {message ? <p className={styles.formNotice}>{message}</p> : null}
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
                <div className={styles.fieldLarge}>
                  <RoleMultiSelect
                    emptyText="No roles could be loaded. Existing slot permissions will be preserved unless changed."
                    label="Allowed Discord roles"
                    loadError={roleLoadError}
                    onChange={(ids) => updateSlotPermissions(slot.id, ids)}
                    roles={roles}
                    selected={permissionDrafts[slot.id] ?? slot.allowedRoleIds}
                  />
                  <p className={styles.fieldHint}>
                    Only members with at least one of these roles can sign up for this slot. Leave empty to allow any eligible member.
                  </p>
                </div>
                <div className={`${styles.quickActions} ${styles.editorActions}`}>
                  <Button disabled={busy} type="submit">Save</Button>
                  <Button disabled={busy} onClick={() => setEditingSlot(null)} type="button" variant="ghost">Cancel</Button>
                </div>
              </form>
            ) : (
              <>
                <div className={styles.slotHeader}>
                  <h3 className={styles.slotTitle} title={slot.name}>
                    <SlotEmoji value={slot.emoji} />
                    <span className={styles.slotNameText}>{slot.name}</span>
                  </h3>
                  <div className={styles.slotHeaderMetaStack}>
                    <span className={styles.orderBadge}>#{index + 1}</span>
                    <span className={styles.capacityBadge}>{slot.participants.length}/{slot.max}</span>
                  </div>
                </div>
                {slot.participants.length ? (
                  <div className={styles.participantList}>
                    {slot.participants.map((participant) => (
                      <ParticipantChip key={participant.id} participant={participant} removable />
                    ))}
                  </div>
                ) : null}
                <div
                  className={`${styles.slotRoleChips} ${slot.allowedRoleIds.length ? "" : styles.slotRoleChipsEmpty}`}
                  title={slot.allowedRoleIds.map(roleName).join(", ")}
                >
                  {slot.allowedRoleIds.length ? (
                    <>
                    {slot.allowedRoleIds.slice(0, 2).map((roleId) => (
                      <span className={styles.slotRoleChip} key={roleId}>
                        <Lock size={11} aria-hidden="true" />
                        {roleName(roleId)}
                      </span>
                    ))}
                    {slot.allowedRoleIds.length > 2 ? (
                      <span className={`${styles.slotRoleChip} ${styles.slotRoleChipMore}`}>
                        +{slot.allowedRoleIds.length - 2}
                      </span>
                    ) : null}
                    </>
                  ) : null}
                </div>
                <div className={styles.slotCardFooter}>
                  <div className={styles.quickActions}>
                    <Button disabled={!manageable || busy} onClick={() => setEditingSlot(slot)} type="button" variant="ghost"><Pencil size={14} aria-hidden="true" />Edit</Button>
                    <Button disabled={!manageable || busy || slot.participants.length > 0} onClick={() => setDeleteSlotId(slot.id)} title={slot.participants.length > 0 ? "Slots with participants cannot be deleted safely." : undefined} type="button" variant="ghost"><Trash2 size={14} aria-hidden="true" />Delete</Button>
                  </div>
                  <div className={styles.slotDragCorner}>{dragHandle}</div>
                </div>
              </>
            )}
          </Card>
        )}
      >
        {adding ? (
          <Card className={`${styles.slotCardCompact} ${styles.slotCardEditing}`}>
            <form className={styles.compactForm} onSubmit={(event) => void createSlot(event)}>
              <label>Name<input name="name" required maxLength={80} placeholder="Flame" /></label>
              <label>Capacity<input name="max" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="1" /></label>
              <label>Display order<input className={styles.orderInput} name="position" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={String(sortedSlots.length)} /><small>Slots are rendered left to right by order.</small></label>
              <EmojiPicker guildId={guildId} />
              <div className={`${styles.quickActions} ${styles.editorActions}`}>
                <Button disabled={busy} type="submit">Create slot</Button>
                <Button disabled={busy} onClick={() => setAdding(false)} type="button" variant="ghost">Cancel</Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card className={`${styles.slotCardCompact} ${styles.slotAddCard}`}>
            <div>
              <h3>Add another role slot</h3>
              <p>Create a new role slot for this event.</p>
            </div>
            <Button disabled={!manageable || busy} onClick={() => setAdding(true)} type="button" variant="secondary">
              <Plus size={16} aria-hidden="true" />
              Add slot
            </Button>
          </Card>
        )}
      </SortableSlotGrid>
      {deleteSlotId ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setDeleteSlotId(null);
            }
          }}
        >
          <div aria-modal="true" className={styles.confirmModal} role="dialog" aria-labelledby="delete-slot-title">
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}><Trash2 size={18} aria-hidden="true" /></span>
              <div>
                <h3 id="delete-slot-title">Delete role slot?</h3>
                <p>This will delete the selected role slot from the event. This action is saved immediately.</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <Button disabled={busy} onClick={() => setDeleteSlotId(null)} type="button" variant="ghost">Cancel</Button>
              <Button disabled={busy} onClick={() => {
                const target = deleteSlotId;
                setDeleteSlotId(null);
                void deleteSlot(target);
              }} type="button" variant="ghost">
                Delete slot
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {recurrenceConfirmOpen ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setRecurrenceConfirmOpen(false);
            }
          }}
        >
          <div aria-modal="true" className={styles.confirmModal} role="dialog" aria-labelledby="slot-recurrence-update-title">
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}><Lock size={18} aria-hidden="true" /></span>
              <div>
                <h3 id="slot-recurrence-update-title">Update recurring event</h3>
                <p>This event belongs to a recurring series. Do you want to update only this occurrence or the entire series?</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <Button disabled={busy} onClick={() => setRecurrenceConfirmOpen(false)} type="button" variant="ghost">Cancel</Button>
              <Button disabled={busy || !pendingSlotSave} onClick={() => pendingSlotSave ? void saveSlotPayload(pendingSlotSave.slotId, pendingSlotSave.payload, "single") : undefined} type="button" variant="ghost">
                Only this occurrence
              </Button>
              <Button disabled={busy || !pendingSlotSave} onClick={() => pendingSlotSave ? void saveSlotPayload(pendingSlotSave.slotId, pendingSlotSave.payload, "series") : undefined} type="button">
                Entire series
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
