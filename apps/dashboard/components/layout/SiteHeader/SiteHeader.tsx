import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { landingNavigation } from "@/config/navigation";
import { routes } from "@/constants/routes";
import styles from "./SiteHeader.module.css";

type SiteHeaderProps = {
  signedIn: boolean;
};

export function SiteHeader({ signedIn }: SiteHeaderProps) {
  return (
    <header className={styles.header}>
      <BrandLogo />
      <nav className={styles.nav} aria-label="Primary navigation">
        {landingNavigation.map((item) => (
          <Link href={item.href} key={item.label}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={styles.actions}>
        <Button href={routes.login} variant="secondary">Log in</Button>
        <Button href={signedIn ? routes.guilds : routes.login}>Open Spectre</Button>
      </div>
    </header>
  );
}
