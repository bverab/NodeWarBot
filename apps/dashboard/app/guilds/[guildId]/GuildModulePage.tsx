import type { LucideIcon } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { GuildNotFound } from "./GuildNotFound";
import { RememberGuild } from "./RememberGuild";
import { getGuildPageContext } from "./guildContext";
import styles from "./overview.module.css";

type GuildModulePageProps = {
  guildId: string;
  preview?: boolean;
  title: string;
  eyebrow: string;
  description: string;
  body: string;
  icon: LucideIcon;
};

export async function GuildModulePage({
  guildId,
  preview = false,
  title,
  eyebrow,
  description,
  body,
  icon: Icon
}: GuildModulePageProps) {
  const { activeGuild, availableGuilds, session } = await getGuildPageContext(guildId, preview);

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

  return (
    <DashboardLayout
      activeGuild={activeGuild}
      availableGuilds={availableGuilds}
      description={description}
      preview={preview}
      title={title}
      userImage={session?.user?.image}
      userName={session?.user?.name ?? session?.user?.email}
    >
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>{eyebrow}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </div>
          <span className={styles.guildMark}>
            <Icon size={30} aria-hidden="true" />
          </span>
        </Card>
        <div className={styles.quickActions}>
          <Button href={guildRoutes.overview(activeGuild.id)} variant="secondary">
            Back to overview
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
