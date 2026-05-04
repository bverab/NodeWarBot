import { AlertTriangle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { routes } from "@/constants/routes";
import type { DashboardGuildSummary } from "@/lib/dashboardGuilds";
import styles from "./overview.module.css";

type GuildNotFoundProps = {
  availableGuilds: DashboardGuildSummary[];
  preview?: boolean;
  userImage?: string | null;
  userName?: string | null;
};

export function GuildNotFound({ availableGuilds, preview = false, userImage, userName }: GuildNotFoundProps) {
  return (
    <DashboardLayout
      availableGuilds={availableGuilds}
      preview={preview}
      title="Guild not found"
      description="Spectre could not resolve this Discord server for your dashboard session."
      userImage={userImage}
      userName={userName}
    >
      <Card className={styles.notFound}>
        <span className={styles.notFoundIcon}>
          <AlertTriangle size={26} aria-hidden="true" />
        </span>
        <span className={styles.eyebrow}>Access check</span>
        <h3>Bot may not be installed in this guild.</h3>
        <p>
          The server is not part of the shared guild set returned by Discord OAuth and the Spectre bot token. Reconnect
          or choose another available guild.
        </p>
        <Button href={routes.guilds}>Back to guilds</Button>
      </Card>
    </DashboardLayout>
  );
}
