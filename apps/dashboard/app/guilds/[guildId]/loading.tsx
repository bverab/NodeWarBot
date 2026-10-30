import { RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/dashboard/guilds/states/EmptyState";

// Streamed while a guild page resolves its Discord access and loads its data.
export default function GuildLoading() {
  return (
    <main aria-busy="true" role="status" style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(560px, 100%)" }}>
        <EmptyState eyebrow="Loading" icon={RefreshCw} title="Loading this server">
          Fetching the latest events and settings.
        </EmptyState>
      </div>
    </main>
  );
}
