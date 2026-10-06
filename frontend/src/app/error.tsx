"use client";

import { useEffect } from "react";
import { AriaMark } from "@/components/layout/AriaMark";

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
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-bg">
      <AriaMark size={40} />
      <h1 className="mt-6 font-serif text-[32px] leading-tight text-ink">Something went wrong</h1>
      <p className="mt-2 text-[15px] max-w-xs leading-relaxed text-ink-2">
        Aria hit a snag. Try again; your session isn&apos;t lost.
      </p>
      <button onClick={reset} className="btn btn-primary mt-8">
        Try again
      </button>
    </main>
  );
}
