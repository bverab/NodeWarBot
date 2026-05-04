import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { routes } from "@/constants/routes";
import { getGuildIconUrl, getInitials } from "@/lib/dashboardGuilds";
import styles from "./GuildCard.module.css";

export type GuildCardData = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  manageable: boolean;
  preview?: boolean;
};

export function GuildCard({ guild }: { guild: GuildCardData }) {
  const iconUrl = guild.preview ? null : getGuildIconUrl(guild);
  const href = `${routes.guilds}/${guild.id}${guild.preview ? "?preview=1" : ""}`;

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <div className={styles.icon}>
          {iconUrl ? <img alt="" src={iconUrl} /> : <span>{getInitials(guild.name)}</span>}
        </div>
        {guild.preview ? <Badge>Preview</Badge> : guild.owner ? <Badge>Owner</Badge> : <Badge tone="muted">Member</Badge>}
      </div>
      <div>
        <h3>{guild.name}</h3>
        <p>{guild.preview ? "Local UI preview data" : guild.id}</p>
      </div>
      <div className={styles.meta}>
        <Badge tone={guild.manageable ? "default" : "muted"}>{guild.manageable ? "Manageable" : "Limited access"}</Badge>
        <Badge tone="muted">Bot installed</Badge>
      </div>
      <Button href={href} variant="secondary">
        <ExternalLink size={17} aria-hidden="true" />
        Manage guild
      </Button>
    </Card>
  );
}
