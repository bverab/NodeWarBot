import { ExternalLink, Swords } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { formatDateTime } from "@/lib/formatters";
import { getGuildEventDetail } from "@/lib/server/dashboardData";
import { EventActions } from "./EventActions";
import { EventSlotGrid } from "./EventSlotGrid";
import { GuildNotFound } from "../../GuildNotFound";
import { ParticipantChip } from "../../ParticipantChip";
import { RememberGuild } from "../../RememberGuild";
import { getGuildPageContext } from "../../guildContext";
import styles from "../../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string; eventId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function EventDetailPage({ params, searchParams }: PageProps) {
  const [{ guildId, eventId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return (
      <GuildNotFound
        availableGuilds={availableGuilds}
        preview={preview}
        userImage={session?.user?.image}
        userName={session?.user?.name ?? session?.user?.email}
      />
    );
  }

  const event = await getGuildEventDetail(activeGuild.id, eventId);

  if (!event) {
    return (
      <DashboardLayout
        activeGuild={activeGuild}
        availableGuilds={availableGuilds}
        description="The requested event was not found for this guild."
        preview={preview}
        title="Event not found"
        userImage={session?.user?.image}
        userName={session?.user?.name ?? session?.user?.email}
      >
        <Card className={styles.emptyPanel}>
          <span className={styles.eyebrow}>Event lookup</span>
          <h3>No event matched this guild and event ID.</h3>
          <p>The event may belong to another server or may no longer exist in the database.</p>
          <Button href={guildRoutes.events(activeGuild.id)}>Back to events</Button>
        </Card>
      </DashboardLayout>
    );
  }

  const totalCapacity = event.roleSlots.reduce((total, slot) => total + slot.max, 0);
  const totalRegistered = event.participantCount;

  return (
    <DashboardLayout
      activeGuild={activeGuild}
      availableGuilds={availableGuilds}
      description="Read-only event details from Spectre bot storage."
      preview={preview}
      title={event.name}
      userImage={session?.user?.image}
      userName={session?.user?.name ?? session?.user?.email}
    >
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>{event.eventType} event</span>
            <h2>{event.name}</h2>
            <p>
              Status: {event.status}. Closes {formatDateTime(event.closesAt)}. Expires {formatDateTime(event.expiresAt)}.
            </p>
          </div>
          <span className={styles.guildMark}>
            <Swords size={30} aria-hidden="true" />
          </span>
        </Card>

        <EventActions
          eventId={event.id}
          guildId={activeGuild.id}
          initialChannelId={event.channelId}
          initialCloseBeforeMinutes={event.closeBeforeMinutes}
          initialClosesAt={event.closesAt}
          initialDuration={event.duration}
          initialEventType={event.eventType}
          initialExpiresAt={event.expiresAt}
          initialMessageId={event.messageId}
          initialName={event.name}
          initialTime={event.time}
          initialTimezone={event.timezone}
          initialType={event.type}
          isClosed={event.status === "closed"}
          manageable={activeGuild.manageable}
        />

        <div className={styles.quickActions}>
          {event.discordUrl ? (
            <Button href={event.discordUrl} variant="ghost">
              <ExternalLink size={16} aria-hidden="true" />
              Open Discord message
            </Button>
          ) : null}
        </div>

        <div className={styles.eventEditorGrid}>
          <section className={styles.editorMain} id="participants" aria-label="Event participants by slot">
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Slot grid</span>
                <h3>Participants</h3>
              </div>
              <span className={styles.status}>{totalRegistered}/{totalCapacity || "?"} signed</span>
            </div>
            {event.roleSlots.length || event.eventType !== "pve" ? (
              <EventSlotGrid eventId={event.id} guildId={activeGuild.id} manageable={activeGuild.manageable} slots={event.roleSlots} />
            ) : event.enrollments.length ? (
              <Card className={styles.slotCardCompact}>
                <div className={styles.slotHeader}><h3>PvE enrollments</h3><span>{event.enrollments.length}</span></div>
                <div className={styles.participantList}>
                  {event.enrollments.map((enrollment) => (
                    <ParticipantChip key={enrollment.id} participant={enrollment} />
                  ))}
                </div>
              </Card>
            ) : (
              <Card className={styles.emptyPanel}>
                <span className={styles.eyebrow}>Participants</span>
                <h3>No participants recorded.</h3>
                <p>Role slot participants or PvE enrollments will appear here once users sign up.</p>
              </Card>
            )}
          </section>

          <aside className={styles.editorAside}>
            <Card>
              <h3>Waitlist</h3>
              {event.waitlist.length ? (
                <div className={styles.participantList}>
                  {event.waitlist.map((entry) => (
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
                <p>No waitlist entries.</p>
              )}
            </Card>
            <Card>
              <h3>Fillers</h3>
              {event.fillers.length ? (
                <div className={styles.participantList}>
                  {event.fillers.map((entry) => (
                    <ParticipantChip key={entry.id} participant={entry} />
                  ))}
                </div>
              ) : (
                <p>No filler entries.</p>
              )}
            </Card>
            <Card>
              <h3>Metadata</h3>
              <p>Inscritos: {totalRegistered}/{totalCapacity || "?"}</p>
              <p>Creator: {event.creatorId ?? "Not recorded"}</p>
              <p>Repeats: schedule data is shown in Schedules.</p>
              <p>Created: {formatDateTime(event.createdAt)}</p>
              <p>Closes: {formatDateTime(event.closesAt)}</p>
            </Card>
            <Card>
              <h3>Publication</h3>
              <p>{event.messageId ? `Discord message ${event.messageId}` : "No Discord publication metadata recorded."}</p>
              {event.discordUrl ? (
                <Button href={event.discordUrl} variant="ghost">
                  <ExternalLink size={16} aria-hidden="true" />
                  Open message
                </Button>
              ) : null}
            </Card>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
