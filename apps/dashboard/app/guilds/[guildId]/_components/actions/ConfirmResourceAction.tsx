"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import styles from "./ConfirmResourceAction.module.css";

type ConfirmResourceActionProps = {
  actionLabel: string;
  actionAriaLabel?: string;
  actionClassName?: string;
  actionIcon?: ReactNode;
  body: string;
  confirmLabel: string;
  endpoint: string;
  redirectTo?: string;
  resourceName: string;
  title: string;
  triggerIconOnly?: boolean;
};

export function ConfirmResourceAction({
  actionLabel,
  actionAriaLabel,
  actionClassName = "",
  actionIcon,
  body,
  confirmLabel,
  endpoint,
  redirectTo,
  resourceName,
  title,
  triggerIconOnly = false
}: ConfirmResourceActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, open]);

  const runAction = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(endpoint, { method: "POST" });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Action failed.");
      }

      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const modal = open ? (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) {
        setOpen(false);
      }
    }}>
      <div aria-modal="true" className={styles.modal} role="dialog" aria-labelledby="confirm-resource-action-title">
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}><AlertTriangle size={18} aria-hidden="true" /></span>
          <div>
            <h3 id="confirm-resource-action-title">{title}</h3>
            <p>{body}</p>
          </div>
        </div>
        <p>Resource: <span className={styles.resourceName}>{resourceName}</span></p>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.modalActions}>
          <Button disabled={busy} onClick={() => setOpen(false)} type="button" variant="ghost">Cancel</Button>
          <Button className={styles.dangerButton} disabled={busy} onClick={() => void runAction()} type="button" variant="ghost">
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <span className={styles.actionWrap}>
      <Button
        aria-label={actionAriaLabel}
        className={`${styles.dangerButton} ${actionClassName}`.trim()}
        onClick={() => {
        setError(null);
        setOpen(true);
      }}
        title={actionAriaLabel ?? actionLabel}
        type="button"
        variant="ghost"
      >
        {actionIcon}
        {triggerIconOnly ? null : actionLabel}
      </Button>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </span>
  );
}
