import { Archive, Pencil, Plus, Trash2, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { formatDateTime } from "@/lib/formatters";
import { getGuildEventsByType } from "@/lib/server/dashboardData";
import { ConfirmResourceAction } from "../ConfirmResourceAction";
import { DisabledIconAction } from "../DisabledIconAction";
import { EventQuickViewModal } from "../EventQuickViewModal";
import { GuildNotFound } from "../GuildNotFound";
import { RememberGuild } from "../RememberGuild";
import { getGuildPageContext } from "../guildContext";
import styles from "../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function PveEventsPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return <GuildNotFound availableGuilds={availableGuilds} preview={preview} userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email} />;
  }

  const events = await getGuildEventsByType(activeGuild.id, "pve");

  return (
    <DashboardLayout activeGuild={activeGuild} availableGuilds={availableGuilds} description="Read-only PvE activity separated from War and Siege events." preview={preview} title="PvE Events" userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email}>
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>PvE activity</span>
            <h2>{events.length ? `${events.length} PvE events found` : "No PvE events yet"}</h2>
            <p>This section separates PvE activities from Node War and Siege coordination using the existing event type.</p>
          </div>
          <span className={styles.guildMark}><Users size={30} aria-hidden="true" /></span>
        </Card>
        <div className={styles.quickActions}>
          <Button href={guildRoutes.newEvent(activeGuild.id)} variant="secondary">
            <Plus size={16} aria-hidden="true" />
            Create event
          </Button>
        </div>
        {events.length ? (
          <Card className={styles.tableCard}>
            <div className={styles.tableHeader}><h3>PvE events</h3></div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Signups</th>
                    <th>Fillers</th>
                    <th>View signups</th>
                    <th>Edit</th>
                    <th>Archive</th>
                    <th>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>{event.name}</td>
                      <td><span className={`${styles.status} ${event.status === "draft" ? styles.statusDraft : ""}`}>{event.status}</span></td>
                      <td>{event.time ? `${event.time} ${event.timezone}` : formatDateTime(event.closesAt)}</td>
                      <td>{event.participantCount}</td>
                      <td>{event.fillerCount}</td>
                      <td className={styles.actionCell}>
                        <EventQuickViewModal
                          editHref={guildRoutes.eventDetail(activeGuild.id, event.id)}
                          eventId={event.id}
                          guildId={activeGuild.id}
                          triggerClassName={styles.iconActionButton}
                          triggerIconOnly
                        />
                      </td>
                      <td className={styles.actionCell}>
                        <Button
                          aria-label={`Edit ${event.name}`}
                          className={styles.iconActionButton}
                          href={guildRoutes.eventDetail(activeGuild.id, event.id)}
                          title={`Edit ${event.name}`}
                          variant="ghost"
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </Button>
                      </td>
                      <td className={styles.actionCell}>
                        {activeGuild.manageable && event.published ? (
                          <ConfirmResourceAction
                            actionAriaLabel={`Archive ${event.name}`}
                            actionClassName={`${styles.iconActionButton} ${styles.archiveIconButton}`}
                            actionIcon={<Archive size={16} aria-hidden="true" />}
                            actionLabel="Archive event"
                            body={`You are about to archive "${event.name}". It will no longer appear as active in the dashboard. Existing Discord messages will not be deleted in this phase.`}
                            confirmLabel="Archive event"
                            endpoint={`/api/guilds/${activeGuild.id}/events/${event.id}/archive`}
                            resourceName={event.name}
                            title="Archive event?"
                            triggerIconOnly
                          />
                        ) : (
                          <DisabledIconAction
                            ariaLabel={`Archive unavailable for ${event.name}`}
                            className={`${styles.iconActionButton} ${styles.archiveIconButton}`}
                            title="Drafts can be deleted directly."
                          >
                            <Archive size={16} aria-hidden="true" />
                          </DisabledIconAction>
                        )}
                      </td>
                      <td className={styles.actionCell}>
                        {activeGuild.manageable && !event.published ? (
                          <ConfirmResourceAction
                            actionAriaLabel={`Delete draft ${event.name}`}
                            actionClassName={`${styles.iconActionButton} ${styles.deleteIconButton}`}
                            actionIcon={<Trash2 size={16} aria-hidden="true" />}
                            actionLabel="Delete draft"
                            body={`You are about to delete the draft PvE event "${event.name}". This event has not been published to Discord. This action cannot be undone.`}
                            confirmLabel="Delete draft"
                            endpoint={`/api/guilds/${activeGuild.id}/events/${event.id}/delete-draft`}
                            resourceName={event.name}
                            title="Delete draft event?"
                            triggerIconOnly
                          />
                        ) : (
                          <DisabledIconAction
                            ariaLabel={`Delete unavailable for ${event.name}`}
                            className={`${styles.iconActionButton} ${styles.deleteIconButton}`}
                            title="Published events can be archived, but Discord messages are not deleted in this phase."
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </DisabledIconAction>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className={styles.emptyPanel}><span className={styles.eyebrow}>PvE events</span><h3>No PvE event records found.</h3><p>Events with `eventType` pve will appear here once created by Spectre.</p><Button href={guildRoutes.newEvent(activeGuild.id)} variant="secondary"><Plus size={16} aria-hidden="true" />Create event</Button></Card>
        )}
      </div>
    </DashboardLayout>
  );
}
