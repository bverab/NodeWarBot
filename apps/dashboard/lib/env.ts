const requiredDiscordEnv = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL"
] as const;

const requiredGoogleEnv = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;

export type DiscordEnvStatus = {
  configured: boolean;
  missing: string[];
};

export type OAuthEnvStatus = {
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

export function getGoogleEnvStatus(): OAuthEnvStatus {
  const missing = requiredGoogleEnv.filter((key) => !process.env[key]);

  return {
    configured: missing.length === 0,
    missing
  };
}
