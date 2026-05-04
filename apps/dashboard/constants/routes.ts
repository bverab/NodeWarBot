export const routes = {
  home: "/",
  login: "/login",
  guilds: "/guilds",
  guildsPreview: "/guilds?preview=1",
  profile: "/profile",
  globalSettings: "/settings",
  discordSignIn: "/login",
  discordSignOut: "/api/auth/signout"
} as const;

export const guildRoutes = {
  overview: (guildId: string) => `/guilds/${guildId}`,
  events: (guildId: string) => `/guilds/${guildId}/events`,
  pveEvents: (guildId: string) => `/guilds/${guildId}/pve-events`,
  eventDetail: (guildId: string, eventId: string) => `/guilds/${guildId}/events/${eventId}`,
  schedules: (guildId: string) => `/guilds/${guildId}/schedules`,
  templates: (guildId: string) => `/guilds/${guildId}/templates`,
  templateDetail: (guildId: string, templateId: string) => `/guilds/${guildId}/templates/${templateId}`,
  analytics: (guildId: string) => `/guilds/${guildId}/analytics`,
  eventStats: (guildId: string) => `/guilds/${guildId}/event-stats`,
  classStats: (guildId: string) => `/guilds/${guildId}/class-stats`,
  signupRoles: (guildId: string) => `/guilds/${guildId}/signup-roles`,
  classSlots: (guildId: string) => `/guilds/${guildId}/class-slots`,
  permissions: (guildId: string) => `/guilds/${guildId}/permissions`,
  garmoth: (guildId: string) => `/guilds/${guildId}/garmoth`,
  settings: (guildId: string) => `/guilds/${guildId}/settings`
} as const;
