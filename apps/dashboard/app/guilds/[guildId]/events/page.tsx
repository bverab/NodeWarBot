import { Pencil, Swords } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { formatDateTime } from "@/lib/formatters";
import { getGuildEventsByType } from "@/lib/server/dashboardData";
import { GuildNotFound } from "../GuildNotFound";
import { RememberGuild } from "../RememberGuild";
import { getGuildPageContext } from "../guildContext";
import styles from "../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

function statusClass(status: "open" | "closed" | "expired") {
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

  const events = await getGuildEventsByType(activeGuild.id, "war");

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
              War and Siege events created by the Discord bot appear here for review. Use Edit to open the compact
              event workspace.
            </p>
          </div>
          <span className={styles.guildMark}>
            <Swords size={30} aria-hidden="true" />
          </span>
        </Card>

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
                    <th>Edit</th>
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
                      <td>
                        <Button href={guildRoutes.eventDetail(activeGuild.id, event.id)} variant="ghost">
                          <Pencil size={16} aria-hidden="true" />
                          Edit
                        </Button>
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
            <p>Once the bot creates events for this guild, they will be listed here in read-only mode.</p>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
