"use client";

import { FormEvent, useState } from "react";
import { Lock, Pencil, RefreshCw, Send, Trash2, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDateForInput } from "@/lib/formatters";
import styles from "../../overview.module.css";

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
  initialClosesAt: string;
  initialExpiresAt: string;
  initialChannelId: string | null;
  initialMessageId: string | null;
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
  initialClosesAt,
  initialExpiresAt,
  initialChannelId,
  initialMessageId,
  isClosed
}: EventActionsProps) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const baseUrl = `/api/guilds/${guildId}/events/${eventId}`;

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

  const submitBasicInfo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manageable) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          eventType: formData.get("eventType"),
          type: formData.get("type"),
          time: formData.get("time"),
          timezone: formData.get("timezone"),
          duration: formData.get("duration"),
          closeBeforeMinutes: formData.get("closeBeforeMinutes"),
          closesAt: formData.get("closesAt"),
          expiresAt: formData.get("expiresAt"),
          channelId: formData.get("channelId"),
          messageId: formData.get("messageId")
        })
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Update failed.");
      }

      setMessage("Event basics updated in the database. Discord sync is pending.");
      setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(false);
    }
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
        <Button disabled title="Discord message sync from web is planned for a later phase." type="button" variant="ghost">
          <Send size={16} aria-hidden="true" />
          Publish/update Discord message
        </Button>
        <Button disabled title="Delete will be connected after event lifecycle rules are finalized." type="button" variant="ghost">
          <Trash2 size={16} aria-hidden="true" />
          Delete
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

      {editing ? (
        <form className={styles.editForm} onSubmit={(event) => void submitBasicInfo(event)}>
          <label>
            Event name
            <input defaultValue={initialName} name="name" minLength={2} maxLength={120} required />
          </label>
          <label>
            Event type
            <input defaultValue={initialEventType} name="eventType" maxLength={32} required />
          </label>
          <label>
            Label
            <input defaultValue={initialType} name="type" maxLength={64} required />
          </label>
          <label>
            Time
            <input defaultValue={initialTime ?? ""} name="time" placeholder="20:00" pattern="\\d{1,2}:\\d{2}" />
          </label>
          <label>
            Timezone
            <input defaultValue={initialTimezone} name="timezone" maxLength={64} />
          </label>
          <label>
            Duration
            <input defaultValue={initialDuration} name="duration" type="number" min={1} max={1440} />
          </label>
          <label>
            Close before expiry
            <input defaultValue={initialCloseBeforeMinutes} name="closeBeforeMinutes" type="number" min={0} max={1440} />
          </label>
          <label>
            Closes at
            <input defaultValue={formatDateForInput(initialClosesAt)} name="closesAt" type="datetime-local" />
          </label>
          <label>
            Expires at
            <input defaultValue={formatDateForInput(initialExpiresAt)} name="expiresAt" type="datetime-local" />
          </label>
          <label>
            Channel ID
            <input defaultValue={initialChannelId ?? ""} name="channelId" maxLength={32} />
          </label>
          <label>
            Message ID
            <input defaultValue={initialMessageId ?? ""} name="messageId" maxLength={32} />
          </label>
          <div className={styles.quickActions}>
            <Button disabled={busy} type="submit">Save basics</Button>
            <Button disabled={busy} onClick={() => setEditing(false)} type="button" variant="ghost">Cancel</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
