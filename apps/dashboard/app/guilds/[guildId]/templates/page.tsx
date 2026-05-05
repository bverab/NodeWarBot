import { Archive, LayoutDashboard, Pencil, Plus, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guildRoutes } from "@/constants/routes";
import { formatDateTime } from "@/lib/formatters";
import { getGuildTemplates } from "@/lib/server/dashboardData";
import { ConfirmResourceAction } from "@/app/guilds/[guildId]/_components/actions/ConfirmResourceAction";
import { DisabledIconAction } from "@/app/guilds/[guildId]/_components/actions/DisabledIconAction";
import { GuildNotFound } from "@/app/guilds/[guildId]/_components/shared/GuildNotFound";
import { RememberGuild } from "@/app/guilds/[guildId]/_components/shared/RememberGuild";
import { TemplatePreviewModal } from "@/app/guilds/[guildId]/_components/modals/TemplatePreviewModal";
import { getGuildPageContext } from "@/app/guilds/[guildId]/_context/guildContext";
import styles from "@/app/guilds/[guildId]/_styles/overview.module.css";

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
            <p>Templates created by Spectre are shown here for preview, editing and safe archival.</p>
          </div>
          <span className={styles.guildMark}><LayoutDashboard size={30} aria-hidden="true" /></span>
        </Card>
        <div className={styles.quickActions}>
          <Button href={guildRoutes.newTemplate(activeGuild.id)} variant="secondary">
            <Plus size={16} aria-hidden="true" />
            Create template
          </Button>
        </div>
        {templates.length ? (
          <Card className={styles.tableCard}>
            <div className={styles.tableHeader}><h3>Templates</h3></div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Time</th>
                    <th>Roles</th>
                    <th>Updated</th>
                    <th>Status</th>
                    <th>Preview</th>
                    <th>Edit</th>
                    <th>Archive</th>
                    <th>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.name}</td>
                      <td>{template.eventType}</td>
                      <td>{template.time ?? "Not set"}</td>
                      <td>{template.roleSlots.length}</td>
                      <td>{formatDateTime(template.updatedAt)}</td>
                      <td><span className={`${styles.status} ${template.isArchived ? styles.statusClosed : styles.statusOpen}`}>{template.isArchived ? "Archived" : "Active"}</span></td>
                      <td className={styles.actionCell}>
                        <TemplatePreviewModal
                          editHref={guildRoutes.templateDetail(activeGuild.id, template.id)}
                          template={template}
                          triggerClassName={styles.iconActionButton}
                          triggerIconOnly
                        />
                      </td>
                      <td className={styles.actionCell}>
                        <Button
                          aria-label={`Edit ${template.name}`}
                          className={styles.iconActionButton}
                          href={guildRoutes.templateDetail(activeGuild.id, template.id)}
                          title={`Edit ${template.name}`}
                          variant="ghost"
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </Button>
                      </td>
                      <td className={styles.actionCell}>
                        {activeGuild.manageable && !template.isArchived ? (
                          <ConfirmResourceAction
                            actionAriaLabel={`Archive ${template.name}`}
                            actionClassName={`${styles.iconActionButton} ${styles.archiveIconButton}`}
                            actionIcon={<Archive size={16} aria-hidden="true" />}
                            actionLabel="Archive template"
                            body={`You are about to archive "${template.name}". It will no longer be available for new event creation. Existing events created from this template will not be affected.`}
                            confirmLabel="Archive template"
                            endpoint={`/api/guilds/${activeGuild.id}/templates/${template.id}/archive`}
                            resourceName={template.name}
                            title="Archive template?"
                            triggerIconOnly
                          />
                        ) : (
                          <DisabledIconAction
                            ariaLabel={`Archive unavailable for ${template.name}`}
                            className={`${styles.iconActionButton} ${styles.archiveIconButton}`}
                            title="This template is already archived."
                          >
                            <Archive size={16} aria-hidden="true" />
                          </DisabledIconAction>
                        )}
                      </td>
                      <td className={styles.actionCell}>
                        <DisabledIconAction
                          ariaLabel={`Delete unavailable for ${template.name}`}
                          className={`${styles.iconActionButton} ${styles.deleteIconButton}`}
                          title="Permanent template delete is not available yet. Use archive instead."
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </DisabledIconAction>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className={styles.emptyPanel}>
            <span className={styles.eyebrow}>Templates</span>
            <h3>No templates found.</h3>
            <p>Reusable event templates will appear here once they are created through Spectre.</p>
            <Button href={guildRoutes.newTemplate(activeGuild.id)} variant="secondary"><Plus size={16} aria-hidden="true" />Create template</Button>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
