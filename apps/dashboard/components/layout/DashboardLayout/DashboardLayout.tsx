import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import type { DashboardGuildSummary } from "@/lib/dashboardGuilds";
import styles from "./DashboardLayout.module.css";

type DashboardLayoutProps = {
  children: ReactNode;
  title: string;
  description?: string;
  userName?: string | null;
  userImage?: string | null;
  preview?: boolean;
  activeGuild?: DashboardGuildSummary | null;
  availableGuilds?: DashboardGuildSummary[];
};

export function DashboardLayout({
  children,
  title,
  description,
  userName,
  userImage,
  preview = false,
  activeGuild = null,
  availableGuilds = []
}: DashboardLayoutProps) {
  const displayName = userName || (preview ? "Preview user" : "Discord user");
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div className={styles.layout}>
      <Sidebar
        activeGuildId={activeGuild?.id}
        avatarUrl={userImage}
        displayName={displayName}
        preview={preview}
      />
      <main className={styles.main}>
        <Topbar
          activeGuild={activeGuild}
          availableGuilds={availableGuilds}
          avatarUrl={userImage}
          displayName={displayName}
          initial={initial}
          preview={preview}
        />

        <section className={styles.content}>
          <div className={styles.header}>
            <div>
              <h1>{title}</h1>
              {description ? <p>{description}</p> : null}
            </div>
          </div>
          {children}
        </section>
      </main>
    </div>
  );
}
