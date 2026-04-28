import { CalendarDays, MessageCircle, RotateCcw, Sparkles, Swords, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { FeatureCard } from "./FeatureCard";
import styles from "./FeatureGrid.module.css";

export function FeatureGrid() {
  return (
    <section className={`${styles.section} ${styles.sectionAtmosphere} container`} id="features">
      <div className={`${styles.heading} ${styles.centered}`}>
        <Badge>Everything your guild needs</Badge>
        <h2>Operational tools with a darker edge.</h2>
        <p className={styles.lede}>
          The current bot already handles the hard parts in Discord. Spectre gives those flows a
          premium web surface without claiming unfinished web controls.
        </p>
      </div>
      <div className={styles.grid}>
        <FeatureCard icon={CalendarDays} title="Event creation">
          Create War, Siege, and PvE events from existing Discord command flows.
        </FeatureCard>
        <FeatureCard icon={Users} title="Role-based signups">
          Manage class slots, signup states, waitlists, and role assignments.
        </FeatureCard>
        <FeatureCard icon={Swords} title="Class slot planning">
          Keep role and class capacity visible for organized rosters.
        </FeatureCard>
        <FeatureCard icon={RotateCcw} title="Recurring schedules">
          Coordinate recurring event series already supported by the bot.
        </FeatureCard>
        <FeatureCard icon={MessageCircle} title="Discord-native interaction">
          Members join, leave, and update inside Discord components.
        </FeatureCard>
        <FeatureCard icon={Sparkles} title="Garmoth context" label="Soon">
          Coming soon: richer dashboard context for profiles and guild prep.
        </FeatureCard>
      </div>
    </section>
  );
}
