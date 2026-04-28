import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import styles from "./NavItem.module.css";

type NavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: string;
};

export function NavItem({ href, label, icon: Icon, active = false, badge }: NavItemProps) {
  return (
    <Link className={active ? `${styles.link} ${styles.linkActive}` : styles.link} href={href}>
      <Icon size={17} aria-hidden="true" />
      <span>{label}</span>
      {badge ? <span className={styles.badge}>{badge}</span> : null}
    </Link>
  );
}
