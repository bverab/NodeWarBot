import { ChartNoAxesColumn } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/formatters";
import { getGuildEvents } from "@/lib/server/dashboardData";
import { GuildNotFound } from "../GuildNotFound";
import { RememberGuild } from "../RememberGuild";
import { getGuildPageContext } from "../guildContext";
import styles from "../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function EventStatsPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return <GuildNotFound availableGuilds={availableGuilds} preview={preview} userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email} />;
  }

  const events = await getGuildEvents(activeGuild.id);

  return (
    <DashboardLayout activeGuild={activeGuild} availableGuilds={availableGuilds} description="Read-only event performance and signup counts." preview={preview} title="Event Stats" userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email}>
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}><div><span className={styles.eyebrow}>Event insights</span><h2>{events.length ? `${events.length} events tracked` : "No event stats yet"}</h2><p>Participant counts, waitlist counts, status, and timing from existing Spectre event records.</p></div><span className={styles.guildMark}><ChartNoAxesColumn size={30} aria-hidden="true" /></span></Card>
        {events.length ? (
          <Card className={styles.tableCard}><div className={styles.tableHeader}><h3>Event stats</h3></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Event</th><th>Type</th><th>Status</th><th>Participants</th><th>Waitlist</th><th>Closes</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.name}</td><td>{event.eventType}</td><td>{event.status}</td><td>{event.participantCount}</td><td>{event.waitlistCount}</td><td>{formatDateTime(event.closesAt)}</td></tr>)}</tbody></table></div></Card>
        ) : (
          <Card className={styles.emptyPanel}><span className={styles.eyebrow}>Event stats</span><h3>No event statistics available.</h3><p>Stats will appear once Spectre has event records for this guild.</p></Card>
        )}
      </div>
    </DashboardLayout>
  );
}
