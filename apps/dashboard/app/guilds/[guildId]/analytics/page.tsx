import { LineChart } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { getGuildOverview } from "@/lib/server/dashboardData";
import { GuildNotFound } from "../GuildNotFound";
import { RememberGuild } from "../RememberGuild";
import { getGuildPageContext } from "../guildContext";
import styles from "../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function AnalyticsPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return <GuildNotFound availableGuilds={availableGuilds} preview={preview} userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email} />;
  }

  const overview = await getGuildOverview(activeGuild.id);
  const metrics = [
    ["Total events", overview.totalEvents],
    ["Active events", overview.activeEvents],
    ["Upcoming events", overview.upcomingEvents],
    ["Total signups", overview.totalParticipants],
    ["Templates", overview.templates],
    ["Garmoth profiles", overview.garmothProfiles],
    ["Scheduled events", overview.scheduledEvents]
  ];

  return (
    <DashboardLayout activeGuild={activeGuild} availableGuilds={availableGuilds} description="Read-only server analytics from Spectre data." preview={preview} title="Analytics" userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email}>
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}><div><span className={styles.eyebrow}>Server insights</span><h2>Guild analytics</h2><p>High-level activity counters from existing event, template, schedule, and Garmoth records.</p></div><span className={styles.guildMark}><LineChart size={30} aria-hidden="true" /></span></Card>
        <section className={styles.summaryGrid}>
          {metrics.map(([label, value]) => (
            <Card className={styles.summaryCard} key={label}><strong className={styles.metric}>{value}</strong><h3>{label}</h3><p>Read-only metric from current Spectre storage.</p></Card>
          ))}
        </section>
      </div>
    </DashboardLayout>
  );
}
