import { Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { routes } from "@/constants/routes";
import styles from "./PlansSection.module.css";

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "For guilds starting with structured event coordination.",
    features: [
      "Discord OAuth access",
      "Guild selection",
      "Basic event preview",
      "Manual event coordination"
    ],
    cta: "Start free",
    href: routes.login,
    highlighted: false
  },
  {
    name: "Plus",
    price: "Coming soon",
    description: "For guilds that need advanced automation and premium controls.",
    features: [
      "Advanced event automation",
      "Recurring schedules",
      "Role/class slot management",
      "Garmoth profile enrichment",
      "Priority dashboard features"
    ],
    cta: "Join waitlist",
    href: routes.login,
    highlighted: true
  }
] as const;

export function PlansSection() {
  return (
    <section className={`${styles.section} container`} id="plans">
      <div className={styles.heading}>
        <Badge>Plans</Badge>
        <h2>Start focused. Scale when your guild needs more control.</h2>
        <p className={styles.lede}>
          Spectre keeps the foundation accessible while advanced automation stays clearly marked as
          premium roadmap work.
        </p>
      </div>

      <div className={styles.grid}>
        {plans.map((plan) => (
          <Card className={`${styles.plan} ${plan.highlighted ? styles.highlighted : ""}`} key={plan.name}>
            <div className={styles.planHeader}>
              <div>
                <h3>{plan.name}</h3>
                <strong>{plan.price}</strong>
              </div>
              {plan.highlighted ? (
                <span className={styles.planBadge}>
                  <Sparkles size={14} aria-hidden="true" />
                  Coming soon
                </span>
              ) : null}
            </div>
            <p>{plan.description}</p>
            <ul className={styles.features}>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={16} aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button href={plan.href} variant={plan.highlighted ? "primary" : "secondary"}>
              {plan.cta}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}
