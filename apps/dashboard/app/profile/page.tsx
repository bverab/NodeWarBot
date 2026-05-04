import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { routes } from "@/constants/routes";
import { getServerAuthSession } from "@/lib/auth";
import { getDashboardGuilds } from "@/lib/dashboardGuilds";
import styles from "./profile.module.css";

export default async function ProfilePage() {
  const session = await getServerAuthSession();

  if (!session) {
    redirect(routes.login);
  }

  const availableGuilds = await getDashboardGuilds(session);
  const displayName = session.user?.name ?? session.user?.email ?? "Discord user";
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <DashboardLayout
      availableGuilds={availableGuilds}
      description="Discord profile and personal Spectre dashboard status."
      title="Profile"
      userImage={session.user?.image}
      userName={displayName}
    >
      <div className={styles.stack}>
        <Card>
          <div className={styles.profileHeader}>
            <span className={styles.avatar}>
              {session.user?.image ? <img alt="" src={session.user.image} /> : initial}
            </span>
            <div>
              <h2>{displayName}</h2>
              <p>{session.user?.email ?? "Discord account connected through OAuth."}</p>
              <span className={styles.badge}>Free</span>
            </div>
          </div>
        </Card>

        <section className={styles.statsGrid} aria-label="Personal Spectre statistics">
          <Card className={styles.stat}>
            <strong>0</strong>
            <span>Events joined will appear here once event data is connected.</span>
          </Card>
          <Card className={styles.stat}>
            <strong>0</strong>
            <span>Events managed will appear here after permissions and events are connected.</span>
          </Card>
          <Card className={styles.stat}>
            <strong>{availableGuilds.length}</strong>
            <span>Guilds connected where Spectre is installed.</span>
          </Card>
          <Card className={styles.stat}>
            <strong>0</strong>
            <span>Garmoth profiles linked will appear here when supported.</span>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
}
