import { redirect } from "next/navigation";
import { guildRoutes } from "@/constants/routes";

type PageProps = {
  params: Promise<{ guildId: string }>;
};

export default async function SignupRolesPage({ params }: PageProps) {
  const { guildId } = await params;
  redirect(guildRoutes.settings(guildId));
}
