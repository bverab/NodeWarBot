"use client";

import { Bell, ChevronDown, Disc3 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { guildRoutes, routes } from "@/constants/routes";
import type { DashboardGuildSummary } from "@/lib/dashboardGuilds";
import { getGuildIconUrl, getInitials } from "@/lib/dashboardGuilds";
import { SignOutButton } from "./SignOutButton";
import styles from "./Topbar.module.css";

type TopbarProps = {
  activeGuild?: DashboardGuildSummary | null;
  availableGuilds?: DashboardGuildSummary[];
  avatarUrl?: string | null;
  displayName: string;
  initial: string;
  preview?: boolean;
};

export function Topbar({
  activeGuild = null,
  availableGuilds = [],
  avatarUrl,
  displayName,
  initial,
  preview = false
}: TopbarProps) {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const activeGuildIconUrl = activeGuild ? getGuildIconUrl(activeGuild) : null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const navigateToGuild = (guildId: string) => {
    setOpen(false);
    router.push(guildRoutes.overview(guildId));
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.guildDropdown} ref={dropdownRef}>
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          className={styles.guildSelector}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className={styles.guildSelectorMark}>
            {activeGuildIconUrl ? (
              <img alt="" src={activeGuildIconUrl} />
            ) : activeGuild ? (
              getInitials(activeGuild.name)
            ) : preview ? (
              "PV"
            ) : (
              "SG"
            )}
          </span>
          <span className={styles.guildSelectorCopy}>
            <strong>{activeGuild?.name ?? (preview ? "Preview guild" : "Select guild")}</strong>
            <span>{preview ? "Local UI data only" : activeGuild ? "Active Spectre server" : "Spectre-enabled guilds"}</span>
          </span>
          <ChevronDown className={open ? styles.chevronOpen : undefined} size={17} aria-hidden="true" />
        </button>
        {open ? (
          <div className={styles.guildMenu} role="listbox" aria-label="Available guilds">
            {availableGuilds.length ? (
              availableGuilds.map((guild) => {
                const iconUrl = getGuildIconUrl(guild);
                const selected = activeGuild?.id === guild.id;

                return (
                  <button
                    aria-selected={selected}
                    className={selected ? `${styles.guildOption} ${styles.guildOptionActive}` : styles.guildOption}
                    key={guild.id}
                    onClick={() => navigateToGuild(guild.id)}
                    role="option"
                    type="button"
                  >
                    <span className={styles.guildOptionMark}>
                      {iconUrl ? <img alt="" src={iconUrl} /> : getInitials(guild.name)}
                    </span>
                    <span>
                      <strong>{guild.name}</strong>
                      <small>{guild.manageable ? "Manageable" : "Limited access"}</small>
                    </span>
                  </button>
                );
              })
            ) : (
              <Link className={styles.guildOption} href={routes.guilds} onClick={() => setOpen(false)}>
                <span className={styles.guildOptionMark}>SG</span>
                <span>
                  <strong>No guilds loaded</strong>
                  <small>Open guild selection</small>
                </span>
              </Link>
            )}
          </div>
        ) : null}
      </div>
      <div className={styles.userArea}>
        <Button href={routes.discordSignIn} variant="secondary">
          <Disc3 size={16} aria-hidden="true" />
          Discord
        </Button>
        <Link className={styles.iconButton} href={activeGuild ? guildRoutes.settings(activeGuild.id) : routes.globalSettings} aria-label="Notification settings">
          <Bell size={17} aria-hidden="true" />
        </Link>
        <div className={styles.userCopy}>
          <strong>{displayName}</strong>
          <span>{preview ? "Preview mode" : "Free"}</span>
        </div>
        <Link className={styles.avatar} href={routes.profile} aria-label="Open profile">
          {avatarUrl ? <img alt="" src={avatarUrl} /> : initial}
        </Link>
        {!preview ? <SignOutButton /> : null}
      </div>
    </header>
  );
}
