import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import styles from "./DashboardLayout.module.css";

type DashboardLayoutProps = {
  children: ReactNode;
  title: string;
  description?: string;
  userName?: string | null;
  preview?: boolean;
};

export function DashboardLayout({ children, title, description, userName, preview = false }: DashboardLayoutProps) {
  const displayName = userName || (preview ? "Preview operator" : "Discord user");
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <Topbar displayName={displayName} initial={initial} preview={preview} />

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
