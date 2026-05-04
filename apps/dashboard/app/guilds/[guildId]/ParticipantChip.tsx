"use client";

import { BdoClassIcon } from "@/components/dashboard/BdoClassIcon";
import styles from "./overview.module.css";

export type ParticipantChipData = {
  id: string;
  userId?: string;
  displayName: string;
  avatarUrl?: string | null;
  className?: string | null;
  spec?: string | null;
  gearScore?: number | null;
};

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

export function ParticipantChip({ participant, removable = false }: { participant: ParticipantChipData; removable?: boolean }) {
  return (
    <span className={styles.participantChip} title={participant.spec ?? undefined}>
      {participant.avatarUrl ? (
        <img alt="" className={styles.participantAvatar} src={participant.avatarUrl} />
      ) : (
        <span className={styles.participantAvatar}>{initials(participant.displayName)}</span>
      )}
      {participant.className ? <BdoClassIcon className={participant.className} /> : null}
      <span className={styles.participantName}>{participant.displayName}</span>
      {participant.gearScore ? <span className={styles.gearBadge}>{participant.gearScore}</span> : null}
      {removable ? <button aria-label={`Remove ${participant.displayName}`} disabled type="button">x</button> : null}
    </span>
  );
}
