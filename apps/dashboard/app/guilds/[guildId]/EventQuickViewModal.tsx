"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/formatters";
import {
  PveEventSignupGrid,
  WarEventSignupGrid,
  type PveEnrollmentSummary,
  type PveOptionSummary,
  type WaitlistSummary,
  type WarSlotSummary
} from "./EventSignupSummary";
import type { ParticipantChipData } from "./ParticipantChip";
import styles from "./EventQuickViewModal.module.css";

type QuickViewEvent = {
  id: string;
  name: string;
  eventType: string;
  status: "draft" | "open" | "closed" | "expired";
  time: string | null;
  timezone: string;
  closesAt: string;
  expiresAt: string;
  participantCount: number;
  waitlistCount: number;
  fillerCount: number;
  roleSlots: WarSlotSummary[];
  enrollments: PveEnrollmentSummary[];
  options: PveOptionSummary[];
  waitlist: WaitlistSummary[];
  fillers: ParticipantChipData[];
};

type EventQuickViewModalProps = {
  editHref: string;
  eventId: string;
  guildId: string;
  triggerClassName?: string;
  triggerIconOnly?: boolean;
  triggerLabel?: string;
};

type EventDetailResponse = {
  event?: QuickViewEvent;
  error?: string;
};

function statusClass(status: QuickViewEvent["status"]) {
  return status === "draft" ? styles.statusDraft : "";
}

export function EventQuickViewModal({
  editHref,
  eventId,
  guildId,
  triggerClassName = "",
  triggerIconOnly = false,
  triggerLabel = "View signups"
}: EventQuickViewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<QuickViewEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const abortController = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/guilds/${guildId}/events/${eventId}`, { signal: abortController.signal })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as EventDetailResponse | null;

        if (!response.ok) {
          throw new Error(json?.error ?? "Failed to load event signups.");
        }

        if (!json?.event) {
          throw new Error("Event detail response did not include an event.");
        }

        setEvent(json.event);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Failed to load event signups.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      });

    return () => abortController.abort();
  }, [eventId, guildId, open]);

  const subtitle = useMemo(() => {
    if (!event) {
      return "Loading signup details...";
    }

    return `${event.time ? `${event.time} ${event.timezone}` : formatDateTime(event.closesAt)} - Expires ${formatDateTime(event.expiresAt)}`;
  }, [event]);

  const modal = open ? (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div aria-modal="true" className={styles.modal} role="dialog" aria-labelledby={`event-quick-view-${eventId}`}>
        <header className={styles.modalHeader}>
          <div>
            <h3 id={`event-quick-view-${eventId}`}>{event?.name ?? "Event signups"}</h3>
            <p>{subtitle}</p>
          </div>
          <div className={styles.modalMeta}>
            {event ? <span className={styles.badge}>{event.eventType}</span> : null}
            {event ? <span className={`${styles.badge} ${statusClass(event.status)}`}>{event.status}</span> : null}
            {event ? <span className={styles.badge}>{event.participantCount} signed</span> : null}
          </div>
        </header>
        <div className={styles.modalBody}>
          {loading ? <div className={styles.emptyState}>Loading signups...</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}
          {!loading && !error && event ? (
            event.eventType === "pve" ? (
              <PveEventSignupGrid
                enrollments={event.enrollments}
                fillers={event.fillers}
                options={event.options}
                waitlist={event.waitlist}
              />
            ) : (
              <WarEventSignupGrid fillers={event.fillers} slots={event.roleSlots} waitlist={event.waitlist} />
            )
          ) : null}
        </div>
        <footer className={styles.modalFooter}>
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">Close</Button>
          <Button href={editHref} variant="secondary">Edit event</Button>
        </footer>
      </div>
    </div>
  ) : null;

  return (
    <span className={styles.actionWrap}>
      <Button
        aria-label={triggerLabel}
        className={triggerClassName}
        onClick={() => setOpen(true)}
        title={triggerLabel}
        type="button"
        variant="ghost"
      >
        <Eye size={16} aria-hidden="true" />
        {triggerIconOnly ? null : triggerLabel}
      </Button>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </span>
  );
}
