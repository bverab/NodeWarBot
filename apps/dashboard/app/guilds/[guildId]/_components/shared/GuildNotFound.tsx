import { AlertTriangle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { routes } from "@/constants/routes";
import type { DashboardGuildSummary } from "@/lib/dashboardGuilds";
import styles from "@/app/guilds/[guildId]/_styles/overview.module.css";

type GuildNotFoundProps = {
  availableGuilds: DashboardGuildSummary[];
  preview?: boolean;
  resolutionError?: string | null;
  userImage?: string | null;
  userName?: string | null;
};

export function GuildNotFound({ availableGuilds, preview = false, resolutionError = null, userImage, userName }: GuildNotFoundProps) {
  const transient = Boolean(resolutionError);

  return (
    <DashboardLayout
      availableGuilds={availableGuilds}
      preview={preview}
      title={transient ? "Guild verification unavailable" : "Guild not found"}
      description={transient ? "Spectre could not verify Discord guild access right now." : "Spectre could not resolve this Discord server for your dashboard session."}
      userImage={userImage}
      userName={userName}
    >
      <Card className={styles.notFound}>
        <span className={styles.notFoundIcon}>
          <AlertTriangle size={26} aria-hidden="true" />
        </span>
        <span className={styles.eyebrow}>Access check</span>
        <h3>{transient ? "Discord guild verification failed temporarily." : "Bot may not be installed in this guild."}</h3>
        <p>
          {transient
            ? resolutionError
            : "The server is not part of the shared guild set returned by Discord OAuth and the Spectre bot token. Reconnect or choose another available guild."}
        </p>
        <Button href={transient ? routes.guilds : routes.guilds}>{transient ? "Retry guilds" : "Back to guilds"}</Button>
      </Card>
    </DashboardLayout>
  );
}
