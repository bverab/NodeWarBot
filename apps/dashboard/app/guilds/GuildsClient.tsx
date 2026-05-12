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
  warning?: string;
  stale?: boolean;
};

type GuildsClientProps = {
  preview?: boolean;
};

export function GuildsClient({ preview = false }: GuildsClientProps) {
  const [guilds, setGuilds] = useState<GuildCardData[]>(preview ? previewGuilds : []);
  const [error, setError] = useState<string | null>(null);
  const [lastGuildId, setLastGuildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    setLastGuildId(window.localStorage.getItem("spectre:lastGuildId"));
  }, []);

  useEffect(() => {
    if (preview) {
      return;
    }

    const run = async () => {
      setLoading(true);
      setError(null);
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
        setError(json.warning ?? null);
      } catch {
        setError("Network error while loading Discord guilds.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [preview, retryToken]);

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    if (guilds.length) {
      return (
        <>
          <ErrorState message={error} onRetry={() => setRetryToken((current) => current + 1)} />
          <GuildsPanel guilds={guilds} lastGuildId={lastGuildId} preview={preview} />
        </>
      );
    }

    return <ErrorState message={error} onRetry={() => setRetryToken((current) => current + 1)} />;
  }

  return <GuildsPanel guilds={guilds} lastGuildId={lastGuildId} preview={preview} />;
}
