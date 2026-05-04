"use client";

import { useEffect, useState } from "react";
import { ErrorState, GuildsPanel, LoadingState, type GuildCardData } from "@/components/dashboard/guilds";
import { previewGuilds } from "@/components/dashboard/guilds/previewData";

type Guild = GuildCardData & {
  permissions: string;
};

type GuildResponse = {
  guilds: Guild[];
  error?: string;
};

type GuildsClientProps = {
  preview?: boolean;
};

export function GuildsClient({ preview = false }: GuildsClientProps) {
  const [guilds, setGuilds] = useState<GuildCardData[]>(preview ? previewGuilds : []);
  const [error, setError] = useState<string | null>(null);
  const [lastGuildId, setLastGuildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!preview);

  useEffect(() => {
    setLastGuildId(window.localStorage.getItem("spectre:lastGuildId"));
  }, []);

  useEffect(() => {
    if (preview) {
      return;
    }

    const run = async () => {
      try {
        const response = await fetch("/api/guilds", { cache: "no-store" });
        if (!response.ok) {
          const json = (await response.json().catch(() => null)) as GuildResponse | null;
          if (response.status === 401) {
            setError("Sign in with Discord to load your guilds.");
            return;
          }

          setError(json?.error ?? `Discord guild fetch failed with status ${response.status}.`);
          return;
        }

        const json = (await response.json()) as GuildResponse;
        setGuilds(json.guilds ?? []);
      } catch {
        setError("Network error while loading Discord guilds.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [preview]);

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return <GuildsPanel guilds={guilds} lastGuildId={lastGuildId} preview={preview} />;
}
