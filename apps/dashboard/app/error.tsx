"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { routes } from "@/constants/routes";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// Shown when a page or one of its server components throws. Without it Next renders its bare default error page.
// Kept deliberately small (shared Button/Card, no icons): this boundary is part of every route's first load.
export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error("[dashboard] unhandled error", error);
  }, [error]);

  return (
    <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: 24 }}>
      <Card>
        <div style={{ display: "grid", gap: 12, maxWidth: 520, textAlign: "center", justifyItems: "center" }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>This page could not be displayed</h1>
          <p style={{ margin: 0, lineHeight: 1.6, opacity: 0.8 }}>
            An unexpected error happened while loading it. Try again; if it keeps failing, check the dashboard server logs
            {error.digest ? ` (reference ${error.digest})` : ""}.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            <Button onClick={reset} type="button">
              Try again
            </Button>
            <Button href={routes.guilds} variant="ghost">
              Back to guilds
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}
