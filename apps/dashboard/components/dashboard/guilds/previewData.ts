import type { GuildCardData } from "@/components/dashboard/guilds";

export const previewGuilds: GuildCardData[] = [
  {
    id: "preview-eternal-order",
    name: "Eternal Order",
    icon: null,
    owner: true,
    manageable: true,
    preview: true
  },
  {
    id: "preview-crimson-veil",
    name: "Crimson Veil",
    icon: null,
    owner: false,
    manageable: true,
    preview: true
  },
  {
    id: "preview-ashen-court",
    name: "Ashen Court",
    icon: null,
    owner: false,
    manageable: false,
    preview: true
  }
];
