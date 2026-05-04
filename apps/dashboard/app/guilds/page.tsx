import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { previewGuilds } from "@/components/dashboard/guilds/previewData";
import { getServerAuthSession } from "@/lib/auth";
import { getDashboardGuilds } from "@/lib/dashboardGuilds";
import { GuildsClient } from "./GuildsClient";

type GuildsPageProps = {
  searchParams?: Promise<{
    preview?: string;
  }>;
};

export default async function GuildsPage({ searchParams }: GuildsPageProps) {
  const params = await searchParams;
  const preview = params?.preview === "1";
  const session = await getServerAuthSession();

  if (!session && !preview) {
    redirect("/login");
  }

  const availableGuilds = preview ? previewGuilds : await getDashboardGuilds(session);

  return (
    <DashboardLayout
      availableGuilds={availableGuilds}
      title={preview ? "Guilds Preview" : "Guilds"}
      description={
        preview
          ? "Preview mode uses local UI data only. It does not call Discord or unlock backend actions."
          : "Choose a Discord guild where Spectre is installed to open its dashboard workspace."
      }
      preview={preview}
      userImage={session?.user?.image}
      userName={session?.user?.name ?? session?.user?.email}
    >
      <GuildsClient preview={preview} />
    </DashboardLayout>
  );
}
