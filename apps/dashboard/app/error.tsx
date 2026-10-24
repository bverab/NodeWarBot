"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/dashboard/guilds/states/EmptyState";
import { Button } from "@/components/ui/Button";
import { routes } from "@/constants/routes";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// Shown when a page or one of its server components throws. Without it Next renders its bare default error page.
export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error("[dashboard] unhandled error", error);
  }, [error]);

  return (
    <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(560px, 100%)" }}>
        <EmptyState
          action={
            <>
              <Button onClick={reset} type="button">
                <RefreshCw size={17} aria-hidden="true" />
                Try again
              </Button>
              <Button href={routes.guilds} variant="ghost">
                Back to guilds
              </Button>
            </>
          }
          eyebrow="Something went wrong"
          icon={AlertTriangle}
          title="This page could not be displayed"
        >
          An unexpected error happened while loading it. Try again; if it keeps failing, check the dashboard server logs
          {error.digest ? ` (reference ${error.digest})` : ""}.
        </EmptyState>
      </div>
    </main>
  );
}
