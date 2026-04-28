import { RefreshCw } from "lucide-react";
import { EmptyState } from "./EmptyState";

export function LoadingState() {
  return (
    <EmptyState icon={RefreshCw} eyebrow="Loading" title="Calling Discord guilds">
      Fetching the guilds available through your OAuth session.
    </EmptyState>
  );
}
