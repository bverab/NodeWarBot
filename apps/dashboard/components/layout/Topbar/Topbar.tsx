import { Bell, ChevronDown, Disc3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { routes } from "@/constants/routes";
import styles from "./Topbar.module.css";

type TopbarProps = {
  displayName: string;
  initial: string;
  preview?: boolean;
};

export function Topbar({ displayName, initial, preview = false }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.guildSelector} aria-label="Guild selector placeholder">
        <span className={styles.guildSelectorMark}>{preview ? "PV" : "EO"}</span>
        <div>
          <strong>{preview ? "Preview guild" : "Select a guild"}</strong>
          <span>{preview ? "Local UI data only" : "Discord OAuth guild list"}</span>
        </div>
        <ChevronDown size={17} aria-hidden="true" />
      </div>
      <div className={styles.userArea}>
        <Button href={routes.discordSignIn} variant="secondary">
          <Disc3 size={16} aria-hidden="true" />
          Discord
        </Button>
        <span className={styles.iconButton} aria-label="Notifications">
          <Bell size={17} aria-hidden="true" />
        </span>
        <div className={styles.userCopy}>
          <strong>{displayName}</strong>
          <span>{preview ? "Preview mode" : "Operator"}</span>
        </div>
        <span className={styles.avatar}>{initial}</span>
      </div>
    </header>
  );
}
