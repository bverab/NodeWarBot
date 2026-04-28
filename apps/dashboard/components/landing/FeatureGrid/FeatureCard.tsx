import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import styles from "./FeatureCard.module.css";

type FeatureCardProps = {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  label?: string;
};

export function FeatureCard({ icon: Icon, title, children, label }: FeatureCardProps) {
  return (
    <Card className={styles.card}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <span className={styles.icon}>
        <Icon size={26} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </Card>
  );
}
