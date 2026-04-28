import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { landingNavigation } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";
import styles from "./SiteFooter.module.css";

const productLinks = landingNavigation.filter((item) => item.href.startsWith("#"));
const resourceLinks = [
  { label: "Dashboard", href: routes.guilds },
  { label: "Login", href: routes.login },
  { label: "Preview mode", href: routes.guildsPreview },
  { label: "Discord", href: routes.discordSignIn }
] as const;

export function SiteFooter() {
  return (
    <footer className={`${styles.footer} container`}>
      <div className={styles.brandColumn}>
        <BrandLogo />
        <p>{siteConfig.description}</p>
        <span className={styles.status}>Web dashboard foundation. Event editing is coming later.</span>
      </div>

      <nav className={styles.linkColumn} aria-label="Product links">
        <h2>Product</h2>
        {productLinks.map((item) => (
          <Link href={item.href} key={item.label}>{item.label}</Link>
        ))}
      </nav>

      <nav className={styles.linkColumn} aria-label="Resources links">
        <h2>Resources</h2>
        {resourceLinks.map((item) => (
          <Link href={item.href} key={item.label}>{item.label}</Link>
        ))}
      </nav>

      <div className={styles.communityColumn}>
        <h2>Community</h2>
        <p>Connect Discord to browse guild access, or use preview mode to inspect the shell safely.</p>
        <Link className={styles.communityLink} href={routes.login}>Open Spectre</Link>
      </div>

      <div className={styles.bottomRow}>
        <span>(c) 2026 Spectre. Built for Discord-native guild operations.</span>
        <span>Black Desert Online references describe player workflows only.</span>
      </div>
    </footer>
  );
}

