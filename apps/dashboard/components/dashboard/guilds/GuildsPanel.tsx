import { Shield, Sparkles, Users } from "lucide-react";
import { StatCard, TableCard } from "@/components/dashboard/cards";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { routes } from "@/constants/routes";
import { GuildCard, type GuildCardData } from "./GuildCard";
import { EmptyState } from "./states/EmptyState";
import styles from "./GuildsPanel.module.css";

type GuildsPanelProps = {
  guilds: GuildCardData[];
  lastGuildId?: string | null;
  preview?: boolean;
};

function getInviteUrl() {
  if (process.env.NEXT_PUBLIC_DISCORD_BOT_INVITE_URL) {
    return process.env.NEXT_PUBLIC_DISCORD_BOT_INVITE_URL;
  }

  if (process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID) {
    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
      permissions: "0",
      scope: "bot applications.commands"
    });

    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  return null;
}

export function GuildsPanel({ guilds, lastGuildId, preview = false }: GuildsPanelProps) {
  const lastGuild = lastGuildId ? guilds.find((guild) => guild.id === lastGuildId) : null;

  if (guilds.length === 0) {
    const inviteUrl = getInviteUrl();

    return (
      <EmptyState
        action={inviteUrl ? <Button href={inviteUrl}>Invite Spectre</Button> : null}
        icon={Users}
        eyebrow="No shared guilds"
        title="No Spectre-enabled guilds were found."
      >
        Spectre must be installed in a Discord server that your account can access. Reconnect after the bot is
        present in a shared guild.
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

      {lastGuild ? (
        <div className={styles.previewBanner}>
          <Badge>Last guild</Badge>
          <span>Resume {lastGuild.name} from your last dashboard session.</span>
          <Button href={`${routes.guilds}/${lastGuild.id}`} variant="secondary">
            Open guild
          </Button>
        </div>
      ) : null}

      <section className={styles.statGrid}>
        <StatCard
          icon={Shield}
          label={preview ? "Preview guilds" : "Available guilds"}
          value={String(guilds.length)}
          detail={preview ? "Local UI dataset" : "Bot installed"}
        />
        <StatCard
          icon={Users}
          label={preview ? "Preview managers" : "Manageable guilds"}
          value={String(guilds.filter((guild) => guild.manageable).length)}
          detail={preview ? "Demo permissions" : "Admin or owner"}
          tone="green"
        />
        <StatCard
          icon={Sparkles}
          label="Web modules"
          value="9"
          detail="Guild dashboard online"
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
              { module: "Installed guild filter", status: <span className={`${styles.status} ${styles.statusOpen}`}>Live</span> },
              { module: "Guild dashboard", status: <span className={`${styles.status} ${styles.statusOpen}`}>Live</span> },
              { module: "War modules", status: <span className={`${styles.status} ${styles.statusDraft}`}>Awaiting bot wiring</span> },
              { module: "Garmoth surface", status: <span className={`${styles.status} ${styles.statusDraft}`}>Awaiting bot wiring</span> }
            ]}
          />
        </aside>
      </section>
    </div>
  );
}
