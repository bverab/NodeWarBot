import { Pencil, Users } from "lucide-react";
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
        {events.length ? (
          <Card className={styles.tableCard}>
            <div className={styles.tableHeader}><h3>PvE events</h3></div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Name</th><th>Status</th><th>Time</th><th>Signups</th><th>Fillers</th><th>Edit</th></tr></thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>{event.name}</td>
                      <td>{event.status}</td>
                      <td>{event.time ? `${event.time} ${event.timezone}` : formatDateTime(event.closesAt)}</td>
                      <td>{event.participantCount}</td>
                      <td>{event.fillerCount}</td>
                      <td><Button href={guildRoutes.eventDetail(activeGuild.id, event.id)} variant="ghost"><Pencil size={16} aria-hidden="true" />Edit</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className={styles.emptyPanel}><span className={styles.eyebrow}>PvE events</span><h3>No PvE event records found.</h3><p>Events with `eventType` pve will appear here once created by Spectre.</p></Card>
        )}
      </div>
    </DashboardLayout>
  );
}
