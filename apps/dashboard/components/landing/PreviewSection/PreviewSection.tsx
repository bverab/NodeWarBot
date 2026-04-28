import { Badge } from "@/components/ui/Badge";
import { DashboardPreview } from "./DashboardPreview";
import styles from "./PreviewSection.module.css";

export function PreviewSection() {
  return (
    <section className={`${styles.section} container`} id="preview">
      <div className={styles.heading}>
        <Badge tone="muted">Dashboard preview</Badge>
        <h2>Professional admin rhythm, guild-first data.</h2>
        <p className={styles.lede}>Current routes stay limited to login and guild access.</p>
      </div>
      <DashboardPreview />
    </section>
  );
}
