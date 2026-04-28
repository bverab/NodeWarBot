import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import styles from "./WorkflowSection.module.css";

export function WorkflowSection() {
  return (
    <section className={`${styles.section} container`} id="workflow">
      <div className={styles.grid}>
        <div className={styles.heading}>
          <Badge tone="muted">How it works</Badge>
          <h2>Simple, fast, Discord-first.</h2>
          <p className={styles.lede}>
            Spectre&apos;s web foundation supports visibility now, while operations remain in the
            proven bot workflows.
          </p>
        </div>
        <div className={styles.steps}>
          <Card>
            <span className={styles.stepNumber}>01</span>
            <h3>Create an event</h3>
            <p>Use existing Discord commands for War, Siege, or PvE setup.</p>
          </Card>
          <Card>
            <span className={styles.stepNumber}>02</span>
            <h3>Share in Discord</h3>
            <p>Publish the bot-managed event where members already coordinate.</p>
          </Card>
          <Card>
            <span className={styles.stepNumber}>03</span>
            <h3>Players join</h3>
            <p>Signups, waitlists, fillers, and role slots update through Discord.</p>
          </Card>
        </div>
      </div>
    </section>
  );
}
