"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// Last resort: it replaces the root layout when the layout itself fails, so it renders its own <html> and
// cannot rely on the global stylesheet.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[dashboard] unhandled root error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          color: "#e9e5ff",
          background: "#05030f",
          fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif'
        }}
      >
        <main style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>Spectre could not load</h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.6, color: "#b9b2d8" }}>
            An unexpected error stopped the dashboard from starting{error.digest ? ` (reference ${error.digest})` : ""}. Try again, and check the server logs if it keeps happening.
          </p>
          <button
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 8,
              padding: "10px 18px",
              color: "#fff",
              background: "#7c3aed",
              cursor: "pointer",
              font: "inherit"
            }}
            type="button"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
