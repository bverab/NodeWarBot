import { LayoutDashboard } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { formatDateTime } from "@/lib/formatters";
import { getGuildTemplateDetail } from "@/lib/server/dashboardData";
import { TemplateVisualEditor } from "./TemplateVisualEditor";
import { GuildNotFound } from "../../GuildNotFound";
import { RememberGuild } from "../../RememberGuild";
import { getGuildPageContext } from "../../guildContext";
import styles from "../../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string; templateId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function TemplateDetailPage({ params, searchParams }: PageProps) {
  const [{ guildId, templateId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return <GuildNotFound availableGuilds={availableGuilds} preview={preview} userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email} />;
  }

  const template = await getGuildTemplateDetail(activeGuild.id, templateId);

  if (!template) {
    return (
      <DashboardLayout activeGuild={activeGuild} availableGuilds={availableGuilds} description="The requested template was not found for this guild." preview={preview} title="Template not found" userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email}>
        <Card className={styles.emptyPanel}><span className={styles.eyebrow}>Template lookup</span><h3>No template matched this guild and template ID.</h3><Button href={guildRoutes.templates(activeGuild.id)}>Back to templates</Button></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeGuild={activeGuild} availableGuilds={availableGuilds} description="Read-only reusable event template details." preview={preview} title={template.name} userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email}>
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>{template.eventType} template</span>
            <h2>{template.name}</h2>
            <p>
              Time: {template.time ?? "Not set"}. Status: {template.isArchived ? "Archived" : "Active"}. Updated {formatDateTime(template.updatedAt)}.
            </p>
          </div>
          <span className={styles.guildMark}><LayoutDashboard size={30} aria-hidden="true" /></span>
        </Card>

        <div className={styles.quickActions}>
          <Button href={guildRoutes.templates(activeGuild.id)} variant="secondary">Back to templates</Button>
        </div>

        <div className={styles.eventEditorGrid}>
          <section className={styles.editorMain}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Template slots</span>
                <h3>Role structure</h3>
              </div>
              <span className={styles.status}>{template.roleSlots.length} slots</span>
            </div>
            <TemplateVisualEditor guildId={activeGuild.id} manageable={activeGuild.manageable} template={template} templateId={template.id} />
          </section>
          <aside className={styles.editorAside}>
            <Card><h3>Announcement defaults</h3><p>Type default: {template.typeDefault}. Duration: {template.duration} minutes. Closes {template.closeBeforeMinutes} minutes before expiry.</p></Card>
            <Card><h3>Notify targets</h3>{template.notifyTargets.length ? <div className={styles.participantList}>{template.notifyTargets.map((target) => <span className={styles.pill} key={target.id}>{target.targetId}</span>)}</div> : <p>No notify targets configured.</p>}</Card>
            <Card><h3>Metadata</h3><p>Created {formatDateTime(template.createdAt)}. Updated {formatDateTime(template.updatedAt)}.</p></Card>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
