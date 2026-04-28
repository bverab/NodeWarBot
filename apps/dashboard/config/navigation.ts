import { routes } from "@/constants/routes";

export const landingNavigation = [
  { label: "Features", href: "#features" },
  { label: "Workflow", href: "#workflow" },
  { label: "Preview", href: "#preview" },
  { label: "Dashboard", href: routes.guilds }
] as const;
