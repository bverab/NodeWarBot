import { Compass } from "lucide-react";
import { EmptyState } from "@/components/dashboard/guilds/states/EmptyState";
import { Button } from "@/components/ui/Button";
import { routes } from "@/constants/routes";

export default function NotFound() {
  return (
    <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(560px, 100%)" }}>
        <EmptyState
          action={
            <>
              <Button href={routes.guilds}>Back to guilds</Button>
              <Button href={routes.home} variant="ghost">
                Home
              </Button>
            </>
          }
          eyebrow="404"
          icon={Compass}
          title="Page not found"
        >
          The page you are looking for does not exist or has been moved.
        </EmptyState>
      </div>
    </main>
  );
}
