"use client";

import { SlotEmoji } from "./SlotEmoji";
import { ParticipantChip, type ParticipantChipData } from "./ParticipantChip";
import styles from "./EventSignupSummary.module.css";

export type PveOptionSummary = {
  id: string;
  label: string;
  time: string;
  capacity: number;
  position: number;
};

export type PveEnrollmentSummary = ParticipantChipData & {
  optionId?: string;
  optionLabel: string;
  optionTime: string;
  enrollmentType?: string;
};

export type WaitlistSummary = {
  id: string;
  position: number;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  className: string | null;
  spec: string | null;
  gearScore: number | null;
  roleName?: string | null;
};

export type WarSlotSummary = {
  id: string;
  name: string;
  max: number;
  position: number;
  emoji: string | null;
  participants: ParticipantChipData[];
};

type PveEventSignupGridProps = {
  enrollments: PveEnrollmentSummary[];
  fillers?: ParticipantChipData[];
  options: PveOptionSummary[];
  showGlobalPanels?: boolean;
  waitlist?: WaitlistSummary[];
};

type WarEventSignupGridProps = {
  fillers?: ParticipantChipData[];
  slots: WarSlotSummary[];
  waitlist?: WaitlistSummary[];
};

function sortByPosition<T extends { position: number }>(items: T[]) {
  return [...items].sort((left, right) => left.position - right.position);
}

function enrollmentBelongsToOption(enrollment: PveEnrollmentSummary, option: PveOptionSummary) {
  if (enrollment.optionId) {
    return enrollment.optionId === option.id;
  }

  return enrollment.optionLabel === option.label && enrollment.optionTime === option.time;
}

function isFillerEnrollment(enrollment: PveEnrollmentSummary) {
  return String(enrollment.enrollmentType ?? "PRIMARY").toUpperCase() === "FILLER";
}

function WaitlistPanel({ waitlist = [] }: { waitlist?: WaitlistSummary[] }) {
  return (
    <section className={styles.summaryPanel}>
      <div className={styles.panelHeader}>
        <div>
          <h3>Waitlist</h3>
          <p>Global waitlist entries for this event.</p>
        </div>
        <span className={styles.capacityBadge}>{waitlist.length}</span>
      </div>
      {waitlist.length ? (
        <div className={styles.participantList}>
          {sortByPosition(waitlist).map((entry) => (
            <ParticipantChip
              key={entry.id}
              participant={{
                id: entry.id,
                userId: entry.userId,
                displayName: `${entry.position}. ${entry.userName}`,
                avatarUrl: entry.avatarUrl,
                className: entry.className,
                spec: entry.spec,
                gearScore: entry.gearScore
              }}
            />
          ))}
        </div>
      ) : (
        <p className={styles.emptyText}>No waitlist entries.</p>
      )}
    </section>
  );
}

function FillersPanel({ fillers = [] }: { fillers?: ParticipantChipData[] }) {
  return (
    <section className={styles.summaryPanel}>
      <div className={styles.panelHeader}>
        <div>
          <h3>Fillers</h3>
          <p>Global filler entries for this event.</p>
        </div>
        <span className={styles.capacityBadge}>{fillers.length}</span>
      </div>
      {fillers.length ? (
        <div className={styles.participantList}>
          {fillers.map((entry) => (
            <ParticipantChip key={entry.id} participant={entry} />
          ))}
        </div>
      ) : (
        <p className={styles.emptyText}>No fillers.</p>
      )}
    </section>
  );
}

export function PveEventSignupGrid({ enrollments, fillers = [], options, showGlobalPanels = true, waitlist = [] }: PveEventSignupGridProps) {
  const sortedOptions = sortByPosition(options);
  const matchedEnrollmentIds = new Set<string>();

  const optionCards = sortedOptions.map((option) => {
    const optionEnrollments = enrollments.filter((enrollment) => enrollmentBelongsToOption(enrollment, option));
    optionEnrollments.forEach((enrollment) => matchedEnrollmentIds.add(enrollment.id));
    const primaryEnrollments = optionEnrollments.filter((enrollment) => !isFillerEnrollment(enrollment));
    const optionFillers = optionEnrollments.filter(isFillerEnrollment);
    const capacity = option.capacity > 0 ? option.capacity : null;
    const isFull = capacity !== null && primaryEnrollments.length >= capacity;

    return (
      <section className={styles.signupCard} key={option.id}>
        <div className={styles.optionHeader}>
          <div className={styles.optionTitle}>
            <h3>{option.label}</h3>
            <span className={styles.optionTime}>{option.time}</span>
          </div>
          <div>
            <span className={styles.capacityBadge}>{primaryEnrollments.length} / {capacity ?? "?"}</span>
            <span className={`${styles.statusBadge} ${isFull ? styles.statusFull : ""}`}>
              {isFull ? "Full" : "Available"}
            </span>
          </div>
        </div>
        {primaryEnrollments.length ? (
          <div className={styles.participantList}>
            {primaryEnrollments.map((enrollment) => (
              <ParticipantChip key={enrollment.id} participant={enrollment} />
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>No signups for this option.</p>
        )}
        <div className={styles.fillerSection}>
          <div className={styles.fillerHeader}>
            <span>Fillers</span>
            <strong>{optionFillers.length}</strong>
          </div>
          {optionFillers.length ? (
            <div className={styles.participantList}>
              {optionFillers.map((enrollment) => (
                <ParticipantChip key={enrollment.id} participant={enrollment} />
              ))}
            </div>
          ) : (
            <p className={styles.emptyText}>No fillers.</p>
          )}
        </div>
      </section>
    );
  });

  const orphanEnrollments = enrollments.filter((enrollment) => !matchedEnrollmentIds.has(enrollment.id));

  return (
    <>
      {optionCards.length ? (
        <div className={styles.signupGrid}>{optionCards}</div>
      ) : (
        <section className={styles.summaryPanel}>
          <div className={styles.panelHeader}>
            <h3>PvE enrollments</h3>
            <span className={styles.capacityBadge}>{enrollments.length}</span>
          </div>
          {enrollments.length ? (
            <div className={styles.participantList}>
              {enrollments.map((enrollment) => (
                <ParticipantChip key={enrollment.id} participant={enrollment} />
              ))}
            </div>
          ) : (
            <p className={styles.emptyText}>No PvE options or enrollments were recorded yet.</p>
          )}
        </section>
      )}
      {orphanEnrollments.length ? (
        <section className={styles.summaryPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Other PvE enrollments</h3>
              <p>These signups reference an option that is no longer listed.</p>
            </div>
            <span className={styles.capacityBadge}>{orphanEnrollments.length}</span>
          </div>
          <div className={styles.participantList}>
            {orphanEnrollments.map((enrollment) => (
              <ParticipantChip key={enrollment.id} participant={enrollment} />
            ))}
          </div>
        </section>
      ) : null}
      {showGlobalPanels && (waitlist.length > 0 || fillers.length > 0) ? (
        <div className={styles.globalGrid}>
          {waitlist.length ? <WaitlistPanel waitlist={waitlist} /> : null}
          {fillers.length ? <FillersPanel fillers={fillers} /> : null}
        </div>
      ) : null}
    </>
  );
}

export function WarEventSignupGrid({ fillers = [], slots, waitlist = [] }: WarEventSignupGridProps) {
  return (
    <>
      <div className={styles.warSlotGrid}>
        {sortByPosition(slots).map((slot, index) => (
          <section className={styles.signupCard} key={slot.id}>
            <div className={styles.optionHeader}>
              <div className={styles.optionTitle}>
                <h3><SlotEmoji value={slot.emoji} />{slot.name}</h3>
                <p>Role slot #{index + 1}</p>
              </div>
              <span className={styles.capacityBadge}>{slot.participants.length} / {slot.max}</span>
            </div>
            {slot.participants.length ? (
              <div className={styles.participantList}>
                {slot.participants.map((participant) => (
                  <ParticipantChip key={participant.id} participant={participant} />
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>No participants in this slot yet.</p>
            )}
          </section>
        ))}
      </div>
      <div className={styles.globalGrid}>
        <WaitlistPanel waitlist={waitlist} />
        <FillersPanel fillers={fillers} />
      </div>
    </>
  );
}
