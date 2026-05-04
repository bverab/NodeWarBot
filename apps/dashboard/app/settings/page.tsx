import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { routes } from "@/constants/routes";
import { getServerAuthSession } from "@/lib/auth";
import { getDashboardGuilds } from "@/lib/dashboardGuilds";
import styles from "../profile/profile.module.css";

export default async function SettingsPage() {
  const session = await getServerAuthSession();

  if (!session) {
    redirect(routes.login);
  }

  const availableGuilds = await getDashboardGuilds(session);

  return (
    <DashboardLayout
      availableGuilds={availableGuilds}
      description="Account-level dashboard preferences will live here."
      title="Settings"
      userImage={session.user?.image}
      userName={session.user?.name ?? session.user?.email}
    >
      <div className={styles.stack}>
        <Card>
          <span className={styles.badge}>Global</span>
          <h3>Account settings</h3>
          <p>Personal dashboard preferences will appear here once settings are connected.</p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
