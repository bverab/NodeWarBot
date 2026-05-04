import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import styles from "./StatCard.module.css";

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: "violet" | "blue" | "green" | "red";
};

export function StatCard({ icon: Icon, label, value, detail, tone = "violet" }: StatCardProps) {
  return (
    <Card className={`${styles.card} ${styles[tone]}`}>
      <div>
        <span className={styles.label}>{label}</span>
        <strong>{value}</strong>
        <span className={styles.detail}>{detail}</span>
      </div>
      <span className={styles.icon}>
        <Icon size={24} aria-hidden="true" />
      </span>
    </Card>
  );
}
