import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { normalizeTimezone } from "@/lib/eventDateTime";
import { getGuildTemplates } from "@/lib/server/dashboardData";
import { getGuildPostChannels, getGuildRoles } from "@/lib/server/discordGuildConfig";
import { GuildNotFound } from "@/app/guilds/[guildId]/_components/shared/GuildNotFound";
import { RememberGuild } from "@/app/guilds/[guildId]/_components/shared/RememberGuild";
import { getGuildPageContext } from "@/app/guilds/[guildId]/_context/guildContext";
import styles from "@/app/guilds/[guildId]/_styles/overview.module.css";
import { NewEventForm } from "./NewEventForm";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function NewEventPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, guildResolutionError, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return (
      <GuildNotFound
        availableGuilds={availableGuilds}
        preview={preview}
        resolutionError={guildResolutionError}
        userImage={session?.user?.image}
        userName={session?.user?.name ?? session?.user?.email}
      />
    );
  }

  const [templates, roles, channels] = await Promise.all([
    getGuildTemplates(activeGuild.id),
    getGuildRoles(activeGuild.id),
    getGuildPostChannels(activeGuild.id)
  ]);

  return (
    <DashboardLayout
      activeGuild={activeGuild}
      availableGuilds={availableGuilds}
      description="Configure the event, slots, schedule and future Discord publication metadata before publishing."
      preview={preview}
      title="Create event draft"
      userImage={session?.user?.image}
      userName={session?.user?.name ?? session?.user?.email}
    >
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        {!activeGuild.manageable ? (
          <Card className={styles.emptyPanel}>
            <span className={styles.eyebrow}>Permission required</span>
            <h3>Event creation requires owner, administrator, or manage guild permissions.</h3>
            <p>You can still view existing events, but draft creation is locked for this server.</p>
          </Card>
        ) : (
          <NewEventForm
            channels={channels}
            guildId={activeGuild.id}
            manageable={activeGuild.manageable}
            roles={roles}
            templates={templates.map((template) => ({
              id: template.id,
              name: template.name,
              eventType: template.eventType,
              typeDefault: template.typeDefault,
              timezone: normalizeTimezone(template.timezone),
              time: template.time,
              duration: template.duration,
              closeBeforeMinutes: template.closeBeforeMinutes,
              slotCount: template.roleSlots.length
            }))}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
