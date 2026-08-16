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
          className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center"
          style={{ background: "#15110D" }}
        >
          <h1 className="text-lg font-semibold mb-2" style={{ color: "#F5F1EA" }}>
            Something went wrong
          </h1>
          <p className="text-sm max-w-xs mb-6" style={{ color: "#8F8878" }}>
            The app failed to load. Please try again.
          </p>
          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #FF6B4A, #F5A623)" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
