import { CalendarDays, Eye, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import styles from "./DashboardPreview.module.css";

const previewRows = [
  ["Calpheon War", "May 24", "24 / 50", "Open"],
  ["Mediah Siege", "May 31", "18 / 50", "Open"],
  ["Valencia PvE", "Jun 7", "12 / 50", "Draft"],
  ["Balenos War", "Jun 14", "50 / 50", "Closed"]
];

const statusClass = {
  Open: styles.statusOpen,
  Draft: styles.statusDraft,
  Closed: styles.statusClosed
} as const;

export function DashboardPreview() {
  return (
    <div className={styles.preview} aria-label="Spectre dashboard preview">
      <aside className={styles.sidebar}>
        <BrandLogo className={styles.brandLogo} size="sm" />
        <div className={styles.nav}>
          <span className={styles.navActive} />
          <span />
          <span />
          <span />
        </div>
      </aside>
      <section className={styles.workspace}>
        <div className={styles.topbar}>
          <div>
            <Badge tone="muted">Dashboard preview</Badge>
            <h2>Guild operations</h2>
          </div>
          <Button href="/login">
            <Plus size={16} aria-hidden="true" />
            Connect
          </Button>
        </div>
        <div className={styles.stats}>
          <div>
            <CalendarDays size={22} aria-hidden="true" />
            <strong>2</strong>
            <span>Active events</span>
          </div>
          <div>
            <Shield size={22} aria-hidden="true" />
            <strong>68</strong>
            <span>Total signups</span>
          </div>
        </div>
        <div className={styles.table}>
          {previewRows.map((row) => (
            <div className={styles.row} key={row[0]}>
              <span>{row[0]}</span>
              <span>{row[1]}</span>
              <span>{row[2]}</span>
              <span className={`${styles.status} ${statusClass[row[3] as keyof typeof statusClass]}`}>
                {row[3]}
              </span>
              <span className={styles.actions}>
                <Eye size={14} aria-hidden="true" />
                <Pencil size={14} aria-hidden="true" />
                <Trash2 size={14} aria-hidden="true" />
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
