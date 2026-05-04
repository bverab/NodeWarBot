import { redirect } from "next/navigation";
import { guildRoutes } from "@/constants/routes";

type PageProps = {
  params: Promise<{ guildId: string }>;
};

export default async function ClassSlotsPage({ params }: PageProps) {
  const { guildId } = await params;
  redirect(guildRoutes.classStats(guildId));
}
