import { CalendarDays, FileText, LineChart, Link2, Shield, Swords, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { formatDateTime } from "@/lib/formatters";
import { getGuildIconUrl, getInitials } from "@/lib/dashboardGuilds";
import { getGuildOverview } from "@/lib/server/dashboardData";
import { GuildNotFound } from "./GuildNotFound";
import { RememberGuild } from "./RememberGuild";
import { getGuildPageContext } from "./guildContext";
import styles from "./overview.module.css";

type GuildDashboardPageProps = {
  params: Promise<{
    guildId: string;
  }>;
  searchParams?: Promise<{
    preview?: string;
  }>;
};

export default async function GuildDashboardPage({ params, searchParams }: GuildDashboardPageProps) {
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

  const iconUrl = getGuildIconUrl(activeGuild);
  const overview = await getGuildOverview(activeGuild.id);
  const summaries = [
    {
      title: "Active events",
      value: String(overview.activeEvents),
      text: overview.activeEvents ? "Open events currently accepting activity." : "No active events yet.",
      icon: Swords
    },
    {
      title: "Upcoming events",
      value: String(overview.upcomingEvents),
      text: overview.upcomingEvents ? "Events that have not expired yet." : "No upcoming events found.",
      icon: CalendarDays
    },
    {
      title: "Signup activity",
      value: String(overview.totalParticipants),
      text: overview.totalParticipants ? "Total event signups recorded by Spectre." : "No participant signups recorded yet.",
      icon: Users
    },
    {
      title: "Templates",
      value: String(overview.templates),
      text: overview.templates ? "Reusable event templates available for this guild." : "No active templates yet.",
      icon: FileText
    },
    {
      title: "Garmoth profiles",
      value: String(overview.garmothProfiles),
      text: overview.garmothProfiles ? "Linked Garmoth profiles for this guild." : "No linked Garmoth profiles yet.",
      icon: Link2
    },
    {
      title: "Scheduled events",
      value: String(overview.scheduledEvents),
      text: overview.scheduledEvents ? "Enabled recurring or scheduled event records." : "No enabled schedules yet.",
      icon: Shield
    }
  ];

  return (
    <DashboardLayout
      activeGuild={activeGuild}
      availableGuilds={availableGuilds}
      description="Server overview for Spectre-managed Black Desert Online operations."
      preview={preview}
      title={activeGuild.name}
      userImage={session?.user?.image}
      userName={session?.user?.name ?? session?.user?.email}
    >
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Server overview</span>
            <h2>{activeGuild.name}</h2>
            <p>
              This workspace is scoped to the selected Discord server. Bot-backed event, schedule, signup, template,
              permission, and Garmoth data will appear here as those modules are connected.
            </p>
          </div>
          <span className={styles.guildMark}>
            {iconUrl ? <img alt="" src={iconUrl} /> : getInitials(activeGuild.name)}
          </span>
        </Card>

        <section className={styles.summaryGrid} aria-label="Guild dashboard summary">
          {summaries.map((summary) => {
            const Icon = summary.icon;

            return (
              <Card className={styles.summaryCard} key={summary.title}>
                <span className={styles.summaryIcon}>
                  <Icon size={21} aria-hidden="true" />
                </span>
                <strong className={styles.metric}>{summary.value}</strong>
                <h3>{summary.title}</h3>
                <p>{summary.text}</p>
              </Card>
            );
          })}
        </section>

        {overview.recentEvents.length ? (
          <Card className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3>Recent events</h3>
              <Button href={guildRoutes.events(activeGuild.id)} variant="ghost">
                View all
              </Button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Closes</th>
                    <th>Signups</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{event.name}</td>
                      <td>{event.eventType}</td>
                      <td>
                        <span className={`${styles.status} ${styles[`status${event.status[0].toUpperCase()}${event.status.slice(1)}`]}`}>
                          {event.status}
                        </span>
                      </td>
                      <td>{formatDateTime(event.closesAt)}</td>
                      <td>{event.participantCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className={styles.emptyPanel}>
            <span className={styles.eyebrow}>Event data</span>
            <h3>No events found yet.</h3>
            <p>Events created by Spectre for this guild will appear here once they exist in the database.</p>
          </Card>
        )}

        <div className={styles.quickActions}>
          <Button href={guildRoutes.events(activeGuild.id)} variant="secondary">
            <Swords size={17} aria-hidden="true" />
            War Events
          </Button>
          <Button href={guildRoutes.pveEvents(activeGuild.id)} variant="secondary">
            <Users size={17} aria-hidden="true" />
            PvE Events
          </Button>
          <Button href={guildRoutes.schedules(activeGuild.id)} variant="secondary">
            <CalendarDays size={17} aria-hidden="true" />
            Schedules
          </Button>
          <Button href={guildRoutes.templates(activeGuild.id)} variant="secondary">
            <FileText size={17} aria-hidden="true" />
            Templates
          </Button>
          <Button href={guildRoutes.analytics(activeGuild.id)} variant="secondary">
            <LineChart size={17} aria-hidden="true" />
            Analytics
          </Button>
          <Button href={guildRoutes.garmoth(activeGuild.id)} variant="secondary">
            <Link2 size={17} aria-hidden="true" />
            Garmoth
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
