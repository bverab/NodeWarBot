import { PieChart } from "lucide-react";
import { BdoClassIcon } from "@/components/dashboard/BdoClassIcon";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { getGuildClassStats } from "@/lib/server/dashboardData";
import { GuildNotFound } from "../GuildNotFound";
import { RememberGuild } from "../RememberGuild";
import { getGuildPageContext } from "../guildContext";
import styles from "../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function ClassStatsPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return <GuildNotFound availableGuilds={availableGuilds} preview={preview} userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email} />;
  }

  const stats = await getGuildClassStats(activeGuild.id);

  return (
    <DashboardLayout activeGuild={activeGuild} availableGuilds={availableGuilds} description="Read-only BDO class distribution from linked Garmoth profiles." preview={preview} title="Class Stats" userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email}>
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}><div><span className={styles.eyebrow}>Class distribution</span><h2>{stats.classes.length ? `${stats.classes.length} classes represented` : "No class data yet"}</h2><p>Class and spec stats are computed from linked Garmoth profiles when available.</p></div><span className={styles.guildMark}><PieChart size={30} aria-hidden="true" /></span></Card>
        {stats.classes.length ? (
          <Card className={styles.tableCard}><div className={styles.tableHeader}><h3>Classes</h3></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Class</th><th>Profiles</th><th>Average GS</th></tr></thead><tbody>{stats.classes.map((entry) => <tr key={entry.className}><td><span className={styles.classCell}><BdoClassIcon className={entry.className} /><span>{entry.className}</span></span></td><td>{entry.count}</td><td>{entry.averageGearScore ?? "Not synced"}</td></tr>)}</tbody></table></div></Card>
        ) : (
          <Card className={styles.emptyPanel}><span className={styles.eyebrow}>Class stats</span><h3>No class distribution available.</h3><p>Class stats will appear once members link Garmoth profiles with class data.</p></Card>
        )}
        {stats.specs.length ? (
          <Card className={styles.tableCard}><div className={styles.tableHeader}><h3>Specs</h3></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Spec</th><th>Profiles</th></tr></thead><tbody>{stats.specs.map((entry) => <tr key={entry.spec}><td>{entry.spec}</td><td>{entry.count}</td></tr>)}</tbody></table></div></Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
