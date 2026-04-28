import type { ReactNode } from "react";
import styles from "./Badge.module.css";

type BadgeProps = {
  children: ReactNode;
  tone?: "default" | "muted";
};

export function Badge({ children, tone = "default" }: BadgeProps) {
  return <span className={tone === "muted" ? `${styles.badge} ${styles.muted}` : styles.badge}>{children}</span>;
}
