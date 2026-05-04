import { Settings } from "lucide-react";
import { GuildModulePage } from "../GuildModulePage";

type PageProps = {
  params: Promise<{ guildId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

export default async function SettingsPage({ params, searchParams }: PageProps) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);

  return (
    <GuildModulePage
      body="Guild-level dashboard settings will be available here when Spectre configuration data is connected."
      description="Guild-scoped dashboard settings."
      eyebrow="Guild configuration"
      guildId={guildId}
      icon={Settings}
      preview={query?.preview === "1"}
      title="Settings"
    />
  );
}
