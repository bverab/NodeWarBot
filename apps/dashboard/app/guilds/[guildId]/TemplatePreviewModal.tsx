"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SlotEmoji } from "./SlotEmoji";
import styles from "./TemplatePreviewModal.module.css";

type TemplatePreviewSlot = {
  id: string;
  name: string;
  max: number;
  position: number;
  emoji: string | null;
  permissions?: Array<{
    discordRoleId: string | null;
    discordRoleName: string | null;
  }>;
};

type TemplatePreviewModalProps = {
  editHref: string;
  template: {
    id: string;
    name: string;
    eventType: string;
    typeDefault: string;
    time: string | null;
    timezone: string;
    isArchived: boolean;
    roleSlots: TemplatePreviewSlot[];
  };
  triggerClassName?: string;
  triggerIconOnly?: boolean;
  triggerLabel?: string;
};

export function TemplatePreviewModal({
  editHref,
  template,
  triggerClassName = "",
  triggerIconOnly = false,
  triggerLabel = "Preview template"
}: TemplatePreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const totalCapacity = useMemo(() => template.roleSlots.reduce((total, slot) => total + slot.max, 0), [template.roleSlots]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const modal = open ? (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div aria-modal="true" className={styles.modal} role="dialog" aria-labelledby={`template-preview-${template.id}`}>
        <header className={styles.header}>
          <div>
            <h3 id={`template-preview-${template.id}`}>{template.name}</h3>
            <p>{template.typeDefault} - {template.time ?? "No default time"} - {template.timezone}</p>
          </div>
          <div className={styles.meta}>
            <span className={styles.badge}>{template.eventType}</span>
            <span className={styles.badge}>{template.isArchived ? "Archived" : "Active"}</span>
          </div>
        </header>
        <div className={styles.body}>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryTile}><span>Slots</span><strong>{template.roleSlots.length}</strong></div>
            <div className={styles.summaryTile}><span>Total capacity</span><strong>{totalCapacity}</strong></div>
            <div className={styles.summaryTile}><span>Status</span><strong>{template.isArchived ? "Archived" : "Active"}</strong></div>
          </div>
          <div className={styles.slotGrid}>
            {[...template.roleSlots].sort((left, right) => left.position - right.position).map((slot, index) => {
              const permissions = slot.permissions ?? [];
              return (
                <section className={styles.slotCard} key={slot.id}>
                  <div className={styles.slotHeader}>
                    <div>
                      <small>Slot {index + 1}</small>
                      <h4><SlotEmoji value={slot.emoji} />{slot.name}</h4>
                    </div>
                    <span className={styles.badge}>{slot.max}</span>
                  </div>
                  <div className={styles.roleList}>
                    {permissions.length ? (
                      permissions.map((permission, permissionIndex) => (
                        <span key={permission.discordRoleId ?? permission.discordRoleName ?? permissionIndex}>
                          {permission.discordRoleName ?? permission.discordRoleId ?? "Unknown role"}
                        </span>
                      ))
                    ) : (
                      <span>Open slot</span>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        <footer className={styles.footer}>
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">Close</Button>
          <Button href={editHref} variant="secondary">Edit template</Button>
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
