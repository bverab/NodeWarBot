"use client";

import {
  CalendarDays,
  ChartNoAxesColumn,
  Crown,
  LineChart,
  LayoutDashboard,
  PieChart,
  Settings,
  Shield,
  Swords,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NavItem } from "@/components/layout/NavItem";
import { guildRoutes, routes } from "@/constants/routes";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  activeGuildId?: string;
  avatarUrl?: string | null;
  displayName: string;
  preview?: boolean;
};

type NavGroup = {
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: string;
    exact?: boolean;
  }>;
};

const baseGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [{ href: routes.guilds, label: "Guilds", icon: Shield }]
  },
  {
    label: "Account",
    items: [
      { href: routes.profile, label: "Profile", icon: Users },
      { href: routes.globalSettings, label: "Settings", icon: Settings }
    ]
  }
];

function getGuildGroups(guildId: string): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [{ href: guildRoutes.overview(guildId), label: "Overview", icon: Shield, exact: true }]
    },
    {
      label: "Events",
      items: [
        { href: guildRoutes.events(guildId), label: "War Events", icon: Swords },
        { href: guildRoutes.pveEvents(guildId), label: "PvE Events", icon: Users },
        { href: guildRoutes.schedules(guildId), label: "Schedules", icon: CalendarDays },
        { href: guildRoutes.templates(guildId), label: "Templates", icon: LayoutDashboard }
      ]
    },
    {
      label: "Insights",
      items: [
        { href: guildRoutes.analytics(guildId), label: "Analytics", icon: LineChart },
        { href: guildRoutes.eventStats(guildId), label: "Event Stats", icon: ChartNoAxesColumn },
        { href: guildRoutes.classStats(guildId), label: "Class Stats", icon: PieChart }
      ]
    },
    {
      label: "Integrations",
      items: [{ href: guildRoutes.garmoth(guildId), label: "Garmoth", icon: Crown, badge: "BDO" }]
    },
    {
      label: "System",
      items: [{ href: guildRoutes.settings(guildId), label: "Settings", icon: Settings }]
    }
  ];
}

function isActiveRoute(pathname: string, href: string, exact = false) {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ activeGuildId, avatarUrl, displayName, preview = false }: SidebarProps) {
  const pathname = usePathname();
  const groups = activeGuildId ? getGuildGroups(activeGuildId) : baseGroups;
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <aside className={styles.sidebar}>
      <BrandLogo className={styles.brandLogo} size="sm" />

      <nav className={styles.nav} aria-label="Dashboard navigation">
        {groups.map((group) => (
          <div className={styles.group} key={group.label}>
            <span className={styles.groupLabel}>{group.label}</span>
            {group.items.map((item) => (
              <NavItem {...item} active={isActiveRoute(pathname, item.href, item.exact)} key={item.label} />
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        <Link className={styles.profileChip} href={routes.profile}>
          <span className={styles.profileAvatar}>
            {avatarUrl ? <img alt="" src={avatarUrl} /> : initial}
          </span>
          <div>
            <strong>{displayName}</strong>
            <span>{preview ? "Preview" : "Free"}</span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
