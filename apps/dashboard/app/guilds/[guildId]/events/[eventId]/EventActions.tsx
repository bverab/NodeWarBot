"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, RefreshCw, Send, Trash2, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { guildRoutes } from "@/constants/routes";
import { normalizeTimezone } from "@/lib/eventDateTime";
import { formatDateForInput } from "@/lib/formatters";
import styles from "@/app/guilds/[guildId]/_styles/overview.module.css";

type EventActionsProps = {
  guildId: string;
  eventId: string;
  manageable: boolean;
  initialName: string;
  initialEventType: string;
  initialType: string;
  initialTime: string | null;
  initialTimezone: string;
  initialDuration: number;
  initialCloseBeforeMinutes: number;
  initialAutoPublishEnabled: boolean;
  initialScheduledPublishAt: string | null;
  initialClosesAt: string;
  initialExpiresAt: string;
  initialChannelId: string | null;
  initialMessageId: string | null;
  initialIsRecurring: boolean;
  isClosed: boolean;
};

async function postAction(url: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  const json = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(json?.error ?? "Action failed.");
  }
}

function normalizeTimeForInput(value: string | null) {
  const match = String(value || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) {
    return "";
  }
  const hour = Number(match[1]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? `${String(hour).padStart(2, "0")}:${match[2]}` : "";
}

export function EventActions({
  guildId,
  eventId,
  manageable,
  initialName,
  initialEventType,
  initialType,
  initialTime,
  initialTimezone,
  initialDuration,
  initialCloseBeforeMinutes,
  initialAutoPublishEnabled,
  initialScheduledPublishAt,
  initialClosesAt,
  initialExpiresAt,
  initialChannelId,
  initialMessageId,
  initialIsRecurring,
  isClosed
}: EventActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [unpublishConfirmOpen, setUnpublishConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recurrenceConfirmOpen, setRecurrenceConfirmOpen] = useState(false);
  const [pendingBasicPayload, setPendingBasicPayload] = useState<Record<string, unknown> | null>(null);
  const savingRef = useRef(false);

  const baseUrl = `/api/guilds/${guildId}/events/${eventId}`;
  const safeInitialTimezone = normalizeTimezone(initialTimezone);
  const initialStartsAt = new Date(new Date(initialExpiresAt).getTime() - initialDuration * 60_000);
  const initialPublishBeforeMinutes = initialScheduledPublishAt
    ? Math.max(0, Math.round((initialStartsAt.getTime() - new Date(initialScheduledPublishAt).getTime()) / 60_000))
    : 60;
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(initialAutoPublishEnabled);
  const [publishBeforeMinutes, setPublishBeforeMinutes] = useState(initialPublishBeforeMinutes);
  const isPublished = Boolean(initialMessageId);
  const canPublish = manageable && !isPublished && Boolean(initialChannelId);
  const eventsListHref = initialEventType === "pve" ? guildRoutes.pveEvents(guildId) : guildRoutes.events(guildId);

  useEffect(() => {
    setAutoPublishEnabled(initialAutoPublishEnabled);
    setPublishBeforeMinutes(initialPublishBeforeMinutes);
  }, [initialAutoPublishEnabled, initialPublishBeforeMinutes]);

  const runCloseAction = async (action: "close" | "reopen") => {
    if (!manageable) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await postAction(`${baseUrl}/${action}`);
      setMessage(action === "close" ? "Signups closed in the database." : "Signups reopened in the database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const publishEvent = async () => {
    if (!canPublish) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(`${baseUrl}/publish`, { method: "POST" });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Publish failed.");
      }

      setPublishConfirmOpen(false);
      setMessage("Event published to Discord.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  };

  const syncEvent = async () => {
    if (!manageable || !isPublished || !initialChannelId) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(`${baseUrl}/sync`, { method: "POST" });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Sync failed.");
      }

      setSyncConfirmOpen(false);
      setMessage("Discord message updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const unpublishEvent = async () => {
    if (!manageable || !isPublished || !initialChannelId) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(`${baseUrl}/unpublish`, { method: "POST" });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Unpublish failed.");
      }

      setUnpublishConfirmOpen(false);
      setMessage("Discord message deleted. Event remains in Spectre as an unpublished draft.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unpublish failed.");
    } finally {
      setBusy(false);
    }
  };

  const deleteEvent = async () => {
    if (!manageable || isPublished) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(`${baseUrl}/delete-draft`, { method: "POST" });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Delete failed.");
      }

      setDeleteConfirmOpen(false);
      router.push(eventsListHref);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const buildBasicInfoPayload = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    const payload: Record<string, unknown> = {
      name: formData.get("name"),
      type: formData.get("type")
    };

    if (!isPublished) {
      payload.eventType = formData.get("eventType");
      payload.time = formData.get("time");
      payload.timezone = normalizeTimezone(String(formData.get("timezone") ?? ""));
      payload.duration = formData.get("duration");
      payload.closeBeforeMinutes = formData.get("closeBeforeMinutes");
      payload.autoPublishEnabled = autoPublishEnabled;
      payload.publishBeforeMinutes = publishBeforeMinutes;
      payload.channelId = formData.get("channelId");
      payload.messageId = formData.get("messageId");
    }

    return payload;
  };

  const saveBasicInfo = async (payload: Record<string, unknown>, recurrenceScope: "single" | "series" = "single") => {
    if (!manageable || busy || savingRef.current) {
      return;
    }

    savingRef.current = true;
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, recurrenceScope })
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Update failed.");
      }

      setRecurrenceConfirmOpen(false);
      setPendingBasicPayload(null);
      setMessage(isPublished ? "Saved. Use Update Discord message to sync Discord." : "Saved.");
      setEditing(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  const submitBasicInfo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manageable || busy || savingRef.current) {
      return;
    }

    const payload = buildBasicInfoPayload(event.currentTarget);
    if (initialIsRecurring) {
      setPendingBasicPayload(payload);
      setRecurrenceConfirmOpen(true);
      return;
    }

    await saveBasicInfo(payload, "single");
  };

  return (
    <div className={styles.actionPanel}>
      <div className={styles.quickActions}>
        <Button disabled={!manageable || busy} onClick={() => setEditing((current) => !current)} title={!manageable ? "Requires owner, administrator, or manage guild permissions." : undefined} type="button" variant="secondary">
          <Pencil size={16} aria-hidden="true" />
          Edit basic info
        </Button>
        <Button disabled={!manageable || busy || isClosed} onClick={() => void runCloseAction("close")} title={!manageable ? "Requires owner, administrator, or manage guild permissions." : undefined} type="button" variant="secondary">
          <XCircle size={16} aria-hidden="true" />
          Close signups
        </Button>
        <Button disabled={!manageable || busy || !isClosed} onClick={() => void runCloseAction("reopen")} title={!manageable ? "Requires owner, administrator, or manage guild permissions." : undefined} type="button" variant="secondary">
          <RefreshCw size={16} aria-hidden="true" />
          Reopen signups
        </Button>
        {isPublished ? (
          <>
            <span className={`${styles.status} ${styles.statusOpen}`}>Published</span>
            <Button
              disabled={!manageable || busy || !initialChannelId}
              onClick={() => setSyncConfirmOpen(true)}
              title={!initialChannelId ? "Published event is missing its Discord channel ID." : undefined}
              type="button"
              variant="ghost"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Update Discord message
            </Button>
            <Button
              disabled={!manageable || busy || !initialChannelId}
              onClick={() => setUnpublishConfirmOpen(true)}
              title={!initialChannelId ? "Published event is missing its Discord channel ID." : undefined}
              type="button"
              variant="ghost"
            >
              <Trash2 size={16} aria-hidden="true" />
              Unpublish from Discord
            </Button>
          </>
        ) : (
          <Button
            disabled={!canPublish || busy}
            onClick={() => setPublishConfirmOpen(true)}
            title={!initialChannelId ? "Select a Discord channel before publishing this event." : undefined}
            type="button"
            variant="ghost"
          >
            <Send size={16} aria-hidden="true" />
            Publish to Discord
          </Button>
        )}
        <Button
          disabled={!manageable || busy || isPublished}
          onClick={() => setDeleteConfirmOpen(true)}
          title={isPublished ? "Unpublish from Discord before deleting this event." : "Delete this event permanently."}
          type="button"
          variant="ghost"
        >
          <Trash2 size={16} aria-hidden="true" />
          Delete permanently
        </Button>
        <Button href="#participants" type="button" variant="ghost">
          <Users size={16} aria-hidden="true" />
          View participants
        </Button>
      </div>

      {!manageable ? (
        <p className={styles.formHint}>
          <Lock size={14} aria-hidden="true" />
          Actions require owner, administrator, or manage guild permissions.
        </p>
      ) : null}

      {message ? <p className={styles.formNotice}>{message}</p> : null}

      {!isPublished && !initialChannelId ? (
        <p className={styles.formHint}>
          <Lock size={14} aria-hidden="true" />
          Select a Discord channel before publishing this event.
        </p>
      ) : null}

      {editing ? (
        <form className={styles.editForm} onSubmit={(event) => void submitBasicInfo(event)}>
          {isPublished ? (
            <p className={`${styles.formHint} ${styles.fieldLarge}`}>
              <Lock size={14} aria-hidden="true" />
              Schedule and Discord publication fields are locked after publishing.
            </p>
          ) : null}
          <label>
            Event name
            <input defaultValue={initialName} name="name" minLength={2} maxLength={120} required />
          </label>
          <label>
            Event type
            <input defaultValue={initialEventType} disabled={isPublished} name="eventType" maxLength={32} required />
          </label>
          <label>
            Label
            <input defaultValue={initialType} name="type" maxLength={64} required />
          </label>
          <label>
            Event start time
            <span className={styles.fieldHint}>Time when the event starts.</span>
            <input defaultValue={normalizeTimeForInput(initialTime)} disabled={isPublished} name="time" step={60} type="time" />
          </label>
          <label>
            Timezone
            <input defaultValue={safeInitialTimezone} disabled={isPublished} name="timezone" maxLength={64} />
          </label>
          <label>
            Event duration (minutes)
            <span className={styles.fieldHint}>How long the event remains active after the start time.</span>
            <input defaultValue={initialDuration} disabled={isPublished} name="duration" type="number" min={1} max={1440} />
          </label>
          <label>
            Close signups before end (minutes)
            <span className={styles.fieldHint}>How many minutes before expiry signups should close.</span>
            <input defaultValue={initialCloseBeforeMinutes} disabled={isPublished} name="closeBeforeMinutes" type="number" min={0} max={1440} />
          </label>
          <label>
            Signups close at
            <span className={styles.fieldHint}>Calculated from the event time, duration and close-before-end setting.</span>
            <input defaultValue={formatDateForInput(initialClosesAt, safeInitialTimezone)} disabled name="closesAt" type="datetime-local" />
          </label>
          <label>
            Event expires at
            <span className={styles.fieldHint}>When the event is considered expired.</span>
            <input defaultValue={formatDateForInput(initialExpiresAt, safeInitialTimezone)} disabled name="expiresAt" type="datetime-local" />
          </label>
          <label>
            Discord publish channel
            <span className={styles.fieldHint}>Channel where the event message is or will be posted.</span>
            <input defaultValue={initialChannelId ?? ""} disabled={isPublished} name="channelId" maxLength={32} />
          </label>
          <label>
            Discord message ID
            <span className={styles.fieldHint}>Stored after publishing. It is cleared when the event is unpublished.</span>
            <input defaultValue={initialMessageId ?? ""} disabled={isPublished} name="messageId" maxLength={32} />
          </label>
          <div className={styles.fieldLarge}>
            <div className={styles.fieldHeading}>Publication</div>
            {isPublished ? (
              <p className={styles.formHint}>
                <Lock size={14} aria-hidden="true" />
                Already published.
              </p>
            ) : (
              <>
                <div className={styles.segmentControl}>
                  <button aria-pressed={!autoPublishEnabled} onClick={() => setAutoPublishEnabled(false)} type="button">Manual publish only</button>
                  <button aria-pressed={autoPublishEnabled} onClick={() => setAutoPublishEnabled(true)} type="button">Schedule automatic publish</button>
                </div>
                <p className={styles.fieldHint}>
                  {autoPublishEnabled
                    ? "Spectre will publish this event automatically before it starts."
                    : "The event will remain as a draft until you publish it manually."}
                </p>
                {autoPublishEnabled ? (
                  <label>
                    Publish before event start (minutes)
                    <input min={0} max={10080} onChange={(event) => setPublishBeforeMinutes(Math.max(0, Number(event.target.value)))} required type="number" value={publishBeforeMinutes} />
                  </label>
                ) : null}
              </>
            )}
          </div>
          <div className={styles.quickActions}>
            <Button disabled={busy} type="submit">Save basics</Button>
            <Button disabled={busy} onClick={() => setEditing(false)} type="button" variant="ghost">Cancel</Button>
          </div>
        </form>
      ) : null}

      {publishConfirmOpen ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setPublishConfirmOpen(false);
            }
          }}
        >
          <div aria-modal="true" className={styles.confirmModal} role="dialog" aria-labelledby="publish-event-title">
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}><Send size={18} aria-hidden="true" /></span>
              <div>
                <h3 id="publish-event-title">Publish event to Discord?</h3>
                <p>This will post "{initialName}" to the selected Discord channel. Members will be able to sign up from Discord.</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <Button disabled={busy} onClick={() => setPublishConfirmOpen(false)} type="button" variant="ghost">Cancel</Button>
              <Button disabled={busy} onClick={() => void publishEvent()} type="button">
                {busy ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {syncConfirmOpen ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setSyncConfirmOpen(false);
            }
          }}
        >
          <div aria-modal="true" className={styles.confirmModal} role="dialog" aria-labelledby="sync-event-title">
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}><RefreshCw size={18} aria-hidden="true" /></span>
              <div>
                <h3 id="sync-event-title">Update Discord message?</h3>
                <p>This will refresh the Discord message for "{initialName}" using the latest dashboard data.</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <Button disabled={busy} onClick={() => setSyncConfirmOpen(false)} type="button" variant="ghost">Cancel</Button>
              <Button disabled={busy} onClick={() => void syncEvent()} type="button">
                {busy ? "Updating..." : "Update message"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {unpublishConfirmOpen ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setUnpublishConfirmOpen(false);
            }
          }}
        >
          <div aria-modal="true" className={styles.confirmModal} role="dialog" aria-labelledby="unpublish-event-title">
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}><Trash2 size={18} aria-hidden="true" /></span>
              <div>
                <h3 id="unpublish-event-title">Unpublish event from Discord?</h3>
                <p>This will delete the Discord message for "{initialName}". The event will remain in Spectre, but members will no longer be able to sign up from the deleted Discord message. You can edit and publish it again later.</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <Button disabled={busy} onClick={() => setUnpublishConfirmOpen(false)} type="button" variant="ghost">Cancel</Button>
              <Button disabled={busy} onClick={() => void unpublishEvent()} type="button" variant="ghost">
                {busy ? "Deleting..." : "Delete Discord message"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmOpen ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setDeleteConfirmOpen(false);
            }
          }}
        >
          <div aria-modal="true" className={styles.confirmModal} role="dialog" aria-labelledby="delete-event-title">
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}><Trash2 size={18} aria-hidden="true" /></span>
              <div>
                <h3 id="delete-event-title">Delete event permanently?</h3>
                <p>This will permanently delete "{initialName}" from Spectre. It is not currently linked to a Discord message. This action cannot be undone.</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <Button disabled={busy} onClick={() => setDeleteConfirmOpen(false)} type="button" variant="ghost">Cancel</Button>
              <Button disabled={busy} onClick={() => void deleteEvent()} type="button" variant="ghost">
                {busy ? "Deleting..." : "Delete permanently"}
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
          <div aria-modal="true" className={styles.confirmModal} role="dialog" aria-labelledby="recurrence-update-title">
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}><RefreshCw size={18} aria-hidden="true" /></span>
              <div>
                <h3 id="recurrence-update-title">Update recurring event</h3>
                <p>This event belongs to a recurring series. Do you want to update only this occurrence or the entire series?</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <Button disabled={busy} onClick={() => setRecurrenceConfirmOpen(false)} type="button" variant="ghost">Cancel</Button>
              <Button disabled={busy || !pendingBasicPayload} onClick={() => pendingBasicPayload ? void saveBasicInfo(pendingBasicPayload, "single") : undefined} type="button" variant="ghost">
                Only this occurrence
              </Button>
              <Button disabled={busy || !pendingBasicPayload} onClick={() => pendingBasicPayload ? void saveBasicInfo(pendingBasicPayload, "series") : undefined} type="button">
                Entire series
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
