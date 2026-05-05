import { Archive, Pencil, Plus, Swords, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { formatDateTime } from "@/lib/formatters";
import { getGuildEventsByTypes } from "@/lib/server/dashboardData";
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

function statusClass(status: "draft" | "open" | "closed" | "expired") {
  if (status === "draft") {
    return styles.statusDraft;
  }

  if (status === "open") {
    return styles.statusOpen;
  }

  if (status === "closed") {
    return styles.statusClosed;
  }

  return styles.statusExpired;
}

export default async function EventsPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
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

  const events = await getGuildEventsByTypes(activeGuild.id, ["war", "siege", "10v10"]);

  return (
    <DashboardLayout
      activeGuild={activeGuild}
      availableGuilds={availableGuilds}
      description="Read-only list of War and Siege events stored by Spectre."
      preview={preview}
      title="War Events"
      userImage={session?.user?.image}
      userName={session?.user?.name ?? session?.user?.email}
    >
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Read-only event data</span>
            <h2>{events.length ? `${events.length} war events found` : "No war events found yet"}</h2>
            <p>
              War and Siege events created by the Discord bot or drafted from the web appear here. Use Edit to open the
              compact event workspace.
            </p>
          </div>
          <span className={styles.guildMark}>
            <Swords size={30} aria-hidden="true" />
          </span>
        </Card>

        <div className={styles.quickActions}>
          <Button href={guildRoutes.newEvent(activeGuild.id)} variant="secondary">
            <Plus size={16} aria-hidden="true" />
            Create event
          </Button>
        </div>

        {events.length ? (
          <Card className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3>Events</h3>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Signups</th>
                    <th>Waitlist</th>
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
                      <td>{event.eventType || event.type}</td>
                      <td>
                        <span className={`${styles.status} ${statusClass(event.status)}`}>{event.status}</span>
                      </td>
                      <td>{event.time ? `${event.time} ${event.timezone}` : formatDateTime(event.closesAt)}</td>
                      <td>{event.participantCount}</td>
                      <td>{event.waitlistCount}</td>
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
                            body={`You are about to delete the draft event "${event.name}". This event has not been published to Discord. This action cannot be undone.`}
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
          <Card className={styles.emptyPanel}>
            <span className={styles.eyebrow}>Events</span>
            <h3>No active or archived events were found.</h3>
            <p>Create a draft from the dashboard or let the bot create events for this guild.</p>
            <Button href={guildRoutes.newEvent(activeGuild.id)} variant="secondary">
              <Plus size={16} aria-hidden="true" />
              Create event
            </Button>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
