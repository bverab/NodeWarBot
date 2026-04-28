import { routes } from "@/constants/routes";

export const siteConfig = {
  name: "Spectre",
  tagline: "Discord-native guild operations for Black Desert Online",
  description: "Premium command layer for War, Siege, PvE events, signups, schedules, and role slots.",
  dashboardPath: routes.guilds,
  loginPath: routes.login
} as const;
