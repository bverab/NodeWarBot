const requiredDiscordEnv = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL"
] as const;

export type DiscordEnvStatus = {
  configured: boolean;
  missing: string[];
};

export function getDiscordEnvStatus(): DiscordEnvStatus {
  const missing = requiredDiscordEnv.filter((key) => !process.env[key]);

  return {
    configured: missing.length === 0,
    missing
  };
}
