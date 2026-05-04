import { CalendarDays, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { formatDateTime } from "@/lib/formatters";
import { getGuildSchedules } from "@/lib/server/dashboardData";
import { GuildNotFound } from "../GuildNotFound";
import { RememberGuild } from "../RememberGuild";
import { getGuildPageContext } from "../guildContext";
import styles from "../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function SchedulesPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return <GuildNotFound availableGuilds={availableGuilds} preview={preview} userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email} />;
  }

  const schedules = await getGuildSchedules(activeGuild.id);

  return (
    <DashboardLayout activeGuild={activeGuild} availableGuilds={availableGuilds} description="Read-only scheduled event records." preview={preview} title="Schedules" userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email}>
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Guild timing</span>
            <h2>{schedules.length ? `${schedules.length} schedules found` : "No schedules yet"}</h2>
            <p>Recurring and scheduled event records from Spectre are shown here without edit controls.</p>
          </div>
          <span className={styles.guildMark}><CalendarDays size={30} aria-hidden="true" /></span>
        </Card>
        {schedules.length ? (
          <>
            <Card className={styles.tableCard}>
              <div className={styles.tableHeader}><h3>Schedules</h3></div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Event</th><th>Type</th><th>Mode</th><th>Enabled</th><th>Last created</th><th>Time</th><th>Preview</th><th>Edit</th></tr></thead>
                  <tbody>
                    {schedules.map((schedule) => (
                      <tr key={schedule.eventId}>
                        <td>{schedule.event.name}</td>
                        <td>{schedule.event.eventType || schedule.event.type || "Unknown"}</td>
                        <td>{schedule.mode}</td>
                        <td>{schedule.enabled ? "Enabled" : "Disabled"}</td>
                        <td>{schedule.lastCreatedAt ? formatDateTime(schedule.lastCreatedAt) : "Never"}</td>
                        <td>{schedule.event.time ?? "Not set"}</td>
                        <td><Button href={guildRoutes.eventDetail(activeGuild.id, schedule.eventId)} variant="ghost"><Eye size={16} aria-hidden="true" />Preview</Button></td>
                        <td><Button href={guildRoutes.eventDetail(activeGuild.id, schedule.eventId)} variant="ghost"><Pencil size={16} aria-hidden="true" />Edit</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <section className={styles.previewGrid} aria-label="Schedule previews">
              {schedules.slice(0, 4).map((schedule) => (
                <Card className={styles.discordPreview} key={`${schedule.eventId}-preview`}>
                  <span className={styles.eyebrow}>{schedule.mode} schedule</span>
                  <h3>{schedule.event.name}</h3>
                  <p>{schedule.event.type}</p>
                  <div className={styles.previewMeta}>
                    <span>{schedule.event.time ?? "Time not set"}</span>
                    <span>{schedule.enabled ? "Enabled" : "Disabled"}</span>
                    <span>{schedule.lastCreatedAt ? `Last: ${formatDateTime(schedule.lastCreatedAt)}` : "Not generated yet"}</span>
                  </div>
                </Card>
              ))}
            </section>
          </>
        ) : (
          <Card className={styles.emptyPanel}><span className={styles.eyebrow}>Schedules</span><h3>No schedules found.</h3><p>Schedules from Spectre will be available here once events are configured for recurrence or timed publication.</p></Card>
        )}
      </div>
    </DashboardLayout>
  );
}
