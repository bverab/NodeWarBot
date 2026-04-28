export const routes = {
  home: "/",
  login: "/login",
  guilds: "/guilds",
  guildsPreview: "/guilds?preview=1",
  discordSignIn: "/api/auth/signin/discord?callbackUrl=/guilds",
  discordSignOut: "/api/auth/signout"
} as const;
