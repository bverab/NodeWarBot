import { LayoutDashboard, Pencil } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { formatDateTime } from "@/lib/formatters";
import { getGuildTemplates } from "@/lib/server/dashboardData";
import { GuildNotFound } from "../GuildNotFound";
import { RememberGuild } from "../RememberGuild";
import { getGuildPageContext } from "../guildContext";
import styles from "../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function TemplatesPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return (
      <GuildNotFound availableGuilds={availableGuilds} preview={preview} userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email} />
    );
  }

  const templates = await getGuildTemplates(activeGuild.id);

  return (
    <DashboardLayout activeGuild={activeGuild} availableGuilds={availableGuilds} description="Read-only reusable event templates." preview={preview} title="Templates" userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email}>
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Message structure</span>
            <h2>{templates.length ? `${templates.length} templates found` : "No templates yet"}</h2>
            <p>Templates created by Spectre are shown here in read-only mode. Template editing is reserved for a later phase.</p>
          </div>
          <span className={styles.guildMark}><LayoutDashboard size={30} aria-hidden="true" /></span>
        </Card>
        {templates.length ? (
          <Card className={styles.tableCard}>
            <div className={styles.tableHeader}><h3>Templates</h3></div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Name</th><th>Type</th><th>Time</th><th>Roles</th><th>Updated</th><th>Status</th><th>Edit</th></tr></thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.name}</td>
                      <td>{template.eventType}</td>
                      <td>{template.time ?? "Not set"}</td>
                      <td>{template.roleSlots.length}</td>
                      <td>{formatDateTime(template.updatedAt)}</td>
                      <td>{template.isArchived ? "Archived" : "Active"}</td>
                      <td><Button href={guildRoutes.templateDetail(activeGuild.id, template.id)} variant="ghost"><Pencil size={16} aria-hidden="true" />Edit</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className={styles.emptyPanel}><span className={styles.eyebrow}>Templates</span><h3>No templates found.</h3><p>Reusable event templates will appear here once they are created through Spectre.</p></Card>
        )}
      </div>
    </DashboardLayout>
  );
}
