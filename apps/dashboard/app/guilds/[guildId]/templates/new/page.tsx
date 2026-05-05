import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { getGuildRoles } from "@/lib/server/discordGuildConfig";
import { GuildNotFound } from "@/app/guilds/[guildId]/_components/shared/GuildNotFound";
import { RememberGuild } from "@/app/guilds/[guildId]/_components/shared/RememberGuild";
import { getGuildPageContext } from "@/app/guilds/[guildId]/_context/guildContext";
import styles from "@/app/guilds/[guildId]/_styles/overview.module.css";
import { NewTemplateForm } from "./NewTemplateForm";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function NewTemplatePage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return (
      <GuildNotFound
        availableGuilds={availableGuilds}
        preview={preview}
        userImage={session?.user?.image}
        userName={session?.user?.name ?? session?.user?.email}
      />
    );
  }

  const roles = await getGuildRoles(activeGuild.id);

  return (
    <DashboardLayout
      activeGuild={activeGuild}
      availableGuilds={availableGuilds}
      description="Create reusable role slot structures for future event drafts."
      preview={preview}
      title="Create template"
      userImage={session?.user?.image}
      userName={session?.user?.name ?? session?.user?.email}
    >
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        {!activeGuild.manageable ? (
          <Card className={styles.emptyPanel}>
            <span className={styles.eyebrow}>Permission required</span>
            <h3>Template creation requires owner, administrator, or manage guild permissions.</h3>
            <p>You can still view existing templates, but creation is locked for this server.</p>
          </Card>
        ) : (
          <NewTemplateForm guildId={activeGuild.id} roles={roles} />
        )}
      </div>
    </DashboardLayout>
  );
}
