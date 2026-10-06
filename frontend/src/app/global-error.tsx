"use client";

import { useEffect } from "react";

// Rendered outside the root layout, so it can't rely on globals.css.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0B0C0E", color: "#F3F1EC", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 15, color: "#BDB9B1", margin: "0 0 24px", maxWidth: 320 }}>Aria failed to load. Please try again.</p>
          <button
            onClick={reset}
            style={{ minHeight: 48, padding: "0 22px", borderRadius: 12, border: 0, background: "#E7B877", color: "#1B1509", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
