"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

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
      className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--canvas)" }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
        style={{ background: "rgba(240,82,90,0.1)", border: "1px solid rgba(240,82,90,0.25)" }}
      >
        <AlertTriangle className="w-6 h-6" style={{ color: "#F0838A" }} aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold mb-2 font-display" style={{ color: "var(--ink)" }}>
        Something went wrong
      </h1>
      <p className="text-sm max-w-xs mb-6 leading-relaxed" style={{ color: "var(--ink-dim)" }}>
        The concierge hit a snag. You can try again — your session isn&apos;t lost.
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
        style={{ background: "linear-gradient(135deg, #FF6B4A, #F5A623)" }}
      >
        Try again
      </button>
    </div>
  );
}
