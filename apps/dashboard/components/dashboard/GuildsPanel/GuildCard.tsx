import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { routes } from "@/constants/routes";
import styles from "./GuildCard.module.css";

export type GuildCardData = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  preview?: boolean;
};

function getGuildIconUrl(guild: GuildCardData) {
  if (!guild.icon || guild.preview) {
    return null;
  }

  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function GuildCard({ guild }: { guild: GuildCardData }) {
  const iconUrl = getGuildIconUrl(guild);

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
        <Badge tone="muted">Admin checks coming soon</Badge>
        <Badge tone="muted">Read-only shell</Badge>
      </div>
      <Button href={routes.guilds} variant="secondary">
        <ExternalLink size={17} aria-hidden="true" />
        View shell
      </Button>
    </Card>
  );
}
