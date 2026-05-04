import { RefreshCw } from "lucide-react";
import { EmptyState } from "./EmptyState";

export function LoadingState() {
  return (
    <EmptyState icon={RefreshCw} eyebrow="Loading" title="Verifying Spectre guilds">
      Comparing your Discord guilds with the servers where the bot is installed.
    </EmptyState>
  );
}
