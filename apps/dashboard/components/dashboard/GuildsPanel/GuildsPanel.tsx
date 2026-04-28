import { Shield, Sparkles, Users } from "lucide-react";
import { StatCard, TableCard } from "@/components/dashboard/DashboardCards";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "./EmptyState";
import { GuildCard, type GuildCardData } from "./GuildCard";
import styles from "./GuildsPanel.module.css";

type GuildsPanelProps = {
  guilds: GuildCardData[];
  preview?: boolean;
};

export function GuildsPanel({ guilds, preview = false }: GuildsPanelProps) {
  if (guilds.length === 0) {
    return (
      <EmptyState icon={Users} eyebrow="No guilds" title="No Discord guilds were returned.">
        Check that your Discord account belongs to a guild and reconnect if needed.
      </EmptyState>
    );
  }

  return (
    <div className={styles.stack}>
      {preview ? (
        <div className={styles.previewBanner}>
          <Badge>Preview mode</Badge>
          <span>This view uses local UI data only. It is not connected to Discord.</span>
        </div>
      ) : null}

      <section className={styles.statGrid}>
        <StatCard
          icon={Shield}
          label={preview ? "Preview guilds" : "Discord guilds"}
          value={String(guilds.length)}
          detail={preview ? "Local UI dataset" : "Returned by OAuth"}
        />
        <StatCard
          icon={Users}
          label={preview ? "Preview owners" : "Owned guilds"}
          value={String(guilds.filter((guild) => guild.owner).length)}
          detail={preview ? "Demo ownership" : "Ownership from Discord"}
          tone="green"
        />
        <StatCard
          icon={Sparkles}
          label="Web modules"
          value="1"
          detail="Guild selection online"
          tone="blue"
        />
      </section>

      <section className={styles.dashboardGrid}>
        <div className={styles.primary}>
          <div className={styles.guildGrid}>
            {guilds.map((guild) => (
              <GuildCard guild={guild} key={guild.id} />
            ))}
          </div>
        </div>

        <aside className={styles.secondary}>
          <TableCard
            title="Current web surface"
            columns={[
              { key: "module", label: "Module" },
              { key: "status", label: "Status" }
            ]}
            rows={[
              { module: "Discord login", status: <span className={`${styles.status} ${styles.statusOpen}`}>Live</span> },
              { module: "Guild list", status: <span className={`${styles.status} ${styles.statusOpen}`}>Live</span> },
              { module: "Event editor", status: <span className={`${styles.status} ${styles.statusDraft}`}>Coming soon</span> },
              { module: "PvE management", status: <span className={`${styles.status} ${styles.statusDraft}`}>Coming soon</span> },
              { module: "Publish/update", status: <span className={`${styles.status} ${styles.statusDraft}`}>Coming soon</span> }
            ]}
          />
        </aside>
      </section>
    </div>
  );
}
