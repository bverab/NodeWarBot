import { Crown } from "lucide-react";
import { BdoClassIcon } from "@/components/dashboard/BdoClassIcon";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/formatters";
import { getGuildGarmothProfiles } from "@/lib/server/dashboardData";
import { fetchDiscordGuildMembers } from "@/lib/server/discordMembers";
import { GuildNotFound } from "../GuildNotFound";
import { RememberGuild } from "../RememberGuild";
import { getGuildPageContext } from "../guildContext";
import styles from "../overview.module.css";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function GarmothPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const { activeGuild, availableGuilds, preview, session } = await getGuildPageContext(guildId, query?.preview === "1");

  if (!activeGuild) {
    return <GuildNotFound availableGuilds={availableGuilds} preview={preview} userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email} />;
  }

  const profiles = await getGuildGarmothProfiles(activeGuild.id);
  const discordMembers = await fetchDiscordGuildMembers(
    activeGuild.id,
    profiles.map((profile) => profile.discordUserId)
  );

  return (
    <DashboardLayout activeGuild={activeGuild} availableGuilds={availableGuilds} description="Read-only linked Garmoth profiles." preview={preview} title="Garmoth" userImage={session?.user?.image} userName={session?.user?.name ?? session?.user?.email}>
      <RememberGuild guildId={activeGuild.id} />
      <div className={styles.stack}>
        <Card className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>BDO profile links</span>
            <h2>{profiles.length ? `${profiles.length} profiles linked` : "No Garmoth profiles linked"}</h2>
            <p>Garmoth profile links stored by Spectre are visible here in read-only mode.</p>
          </div>
          <span className={styles.guildMark}><Crown size={30} aria-hidden="true" /></span>
        </Card>
        {profiles.length ? (
          <Card className={styles.tableCard}>
            <div className={styles.tableHeader}><h3>Linked profiles</h3></div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Discord user</th><th>Character</th><th>Class</th><th>Spec</th><th>Gear score</th><th>Sync</th><th>Updated</th></tr></thead>
                <tbody>
                  {profiles.map((profile) => {
                    const member = discordMembers.get(profile.discordUserId);
                    const displayName = member?.displayName ?? profile.characterName ?? "Discord user";
                    const username = member?.username ? `@${member.username}` : "Discord member";
                    const fallbackInitials = displayName.slice(0, 2).toUpperCase();

                    return (
                      <tr key={profile.id}>
                        <td>
                          <span className={styles.identityCell}>
                            <span className={styles.identityAvatar}>
                              {member?.avatarUrl ? <img alt="" src={member.avatarUrl} /> : fallbackInitials}
                            </span>
                            <span className={styles.identityText}>
                              <strong>{displayName}</strong>
                              <small>{username}</small>
                            </span>
                          </span>
                        </td>
                        <td>{profile.characterName ?? "Not synced"}</td>
                        <td>
                          <span className={styles.classCell}>
                            <BdoClassIcon className={profile.className} />
                            <span>{profile.className ?? "Unknown"}</span>
                          </span>
                        </td>
                        <td>{profile.spec ?? profile.specRaw ?? "Not set"}</td>
                        <td>{profile.gearScore ?? "Not synced"}</td>
                        <td>{profile.syncStatus}</td>
                        <td>{formatDateTime(profile.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className={styles.emptyPanel}><span className={styles.eyebrow}>Garmoth</span><h3>No linked profiles found.</h3><p>Linked Garmoth profiles will appear here when guild members connect them through supported bot flows.</p></Card>
        )}
      </div>
    </DashboardLayout>
  );
}
