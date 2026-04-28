import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import styles from "./GuildsPanel.module.css";

type EmptyStateProps = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, eyebrow, title, children, action }: EmptyStateProps) {
  return (
    <Card className={styles.emptyState}>
      <span className={styles.emptyStateIcon}>
        <Icon size={26} aria-hidden="true" />
      </span>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action ? <div className={styles.actions}>{action}</div> : null}
    </Card>
  );
}
