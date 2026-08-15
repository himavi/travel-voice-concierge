"use client";

import { useEffect } from "react";

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
      <body>
        <div
          className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center text-white"
          style={{ background: "#05030f" }}
        >
          <h1 className="text-lg font-semibold mb-2" style={{ color: "#f3e8ff" }}>
            Something went wrong
          </h1>
          <p className="text-sm max-w-xs mb-6" style={{ color: "#9c8fc0" }}>
            The app failed to load. Please try again.
          </p>
          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
