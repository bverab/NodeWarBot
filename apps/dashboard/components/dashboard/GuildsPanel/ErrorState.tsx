import { RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { routes } from "@/constants/routes";
import { EmptyState } from "./EmptyState";

type ErrorStateProps = {
  message: string;
};

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <EmptyState
      action={
        <Button href={routes.login}>
          <RefreshCw size={17} aria-hidden="true" />
          Reconnect
        </Button>
      }
      eyebrow="Access state"
      icon={Shield}
      title={message}
    >
      Guild data comes from Discord OAuth and requires the `identify guilds` scope.
    </EmptyState>
  );
}
