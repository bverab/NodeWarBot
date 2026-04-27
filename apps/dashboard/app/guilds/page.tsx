"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Guild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

type GuildResponse = {
  guilds: Guild[];
};

export default function GuildsPage() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch("/api/guilds", { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 401) {
            setError("You need to sign in first.");
            return;
          }

          setError(`Guild fetch failed with status ${response.status}.`);
          return;
        }

        const json = (await response.json()) as GuildResponse;
        setGuilds(json.guilds ?? []);
      } catch {
        setError("Network error while loading guilds.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Your Discord Guilds</h1>

      {loading ? <p>Loading guilds...</p> : null}
      {!loading && error ? <p>{error}</p> : null}

      {!loading && !error ? (
        <ul>
          {guilds.map((guild) => (
            <li key={guild.id}>
              <strong>{guild.name}</strong> ({guild.id})
            </li>
          ))}
        </ul>
      ) : null}

      <nav style={{ display: "flex", gap: 12 }}>
        <Link href="/">Home</Link>
        <Link href="/login">Login</Link>
        <Link href="/api/auth/signout">Sign out</Link>
      </nav>
    </main>
  );
}
