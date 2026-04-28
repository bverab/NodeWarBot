import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getServerAuthSession } from "@/lib/auth";
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

  return (
    <DashboardLayout
      title={preview ? "Guilds Preview" : "Guilds"}
      description={
        preview
          ? "Preview mode uses local UI data only. It does not call Discord or unlock backend actions."
          : "Choose a Discord guild to prepare future Spectre dashboard views."
      }
      preview={preview}
      userName={session?.user?.name ?? session?.user?.email}
    >
      <GuildsClient preview={preview} />
    </DashboardLayout>
  );
}
