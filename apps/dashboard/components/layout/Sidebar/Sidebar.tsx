import {
  CalendarDays,
  Crown,
  LayoutDashboard,
  LockKeyhole,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Users
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NavItem } from "@/components/layout/NavItem";
import styles from "./Sidebar.module.css";

const groups = [
  {
    label: "Overview",
    items: [{ href: "/guilds", label: "Guilds", icon: Shield, active: true }]
  },
  {
    label: "Events",
    items: [
      { href: "/guilds", label: "War Events", icon: Swords },
      { href: "/guilds", label: "Schedules", icon: CalendarDays },
      { href: "/guilds", label: "Templates", icon: LayoutDashboard }
    ]
  },
  {
    label: "Management",
    items: [
      { href: "/guilds", label: "Signup Roles", icon: Users },
      { href: "/guilds", label: "Class Slots", icon: Sparkles },
      { href: "/guilds", label: "Permissions", icon: LockKeyhole }
    ]
  },
  {
    label: "Integrations",
    items: [
      { href: "/guilds", label: "Garmoth", icon: Crown, badge: "Soon" },
      { href: "/guilds", label: "Settings", icon: Settings }
    ]
  }
];

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <BrandLogo className={styles.brandLogo} size="sm" />

      <nav className={styles.nav} aria-label="Dashboard navigation">
        {groups.map((group) => (
          <div className={styles.group} key={group.label}>
            <span className={styles.groupLabel}>{group.label}</span>
            {group.items.map((item) => (
              <NavItem {...item} key={item.label} />
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={styles.guildChip}>
          <span className={styles.guildChipIcon}>EO</span>
          <div>
            <strong>Eternal Order</strong>
            <span>Guild placeholder</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
