"use client";

import { useEffect } from "react";

export default function Error({
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
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center text-white"
      style={{ background: "#05030f" }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
      >
        <span className="text-2xl" aria-hidden="true">⚠️</span>
      </div>
      <h1 className="text-lg font-semibold mb-2" style={{ color: "#f3e8ff" }}>
        Something went wrong
      </h1>
      <p className="text-sm max-w-xs mb-6" style={{ color: "#9c8fc0" }}>
        The concierge hit a snag. You can try again — your session isn&apos;t lost.
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
        style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
      >
        Try again
      </button>
    </div>
  );
}
