"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { BackendState } from "@/lib/types";
import { OrbCanvas, type OrbState } from "@/components/voice/OrbCanvas";
import { useMediaQuery } from "@/components/ui/useMediaQuery";

const DEMO: { state: OrbState; label: string }[] = [
  { state: "listening", label: "listening" },
  { state: "thinking", label: "thinking" },
  { state: "speaking", label: "speaking" },
];

/**
 * Landing visual: the same orb the conversation uses, stepping through the
 * three states a caller will see, with a caption naming each one. Mirrors the
 * backend while it cold-starts. Decorative for assistive tech (the status
 * line next to the buttons carries the real state).
 */
export function HeroOrb({ backend }: { backend: BackendState }) {
  const isLarge = useMediaQuery("(min-width: 1024px)");
  const isSmall = useMediaQuery("(max-width: 380px)");
  const isShort = useMediaQuery("(max-height: 720px)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [mounted, setMounted] = useState(false);
  const [i, setI] = useState(0);
  const t0 = useRef(0);

  useEffect(() => {
    setMounted(true);
    t0.current = performance.now();
  }, []);

  useEffect(() => {
    if (backend !== "ready" || reduced) return;
    const id = setInterval(() => setI((v) => (v + 1) % DEMO.length), 3000);
    return () => clearInterval(id);
  }, [backend, reduced]);

  const state: OrbState =
    backend === "waking" ? "waking" : backend === "down" ? "muted" : reduced ? "ambient" : DEMO[i].state;
  const size = isLarge ? 400 : isShort ? 156 : isSmall ? 200 : 236;

  // A plausible speech-like input level for the demo "listening" phase.
  const demoLevel = () => {
    const t = (performance.now() - t0.current) / 1000;
    return 0.25 + 0.2 * Math.abs(Math.sin(t * 4.1)) * (0.6 + 0.4 * Math.sin(t * 1.3));
  };

  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        {mounted && <OrbCanvas state={state} size={size} getLevel={demoLevel} />}
      </div>
      <div className="mt-1 h-5 flex items-center gap-3 font-mono text-[11px] tracking-wide">
        {backend === "ready" && !reduced ? (
          DEMO.map((d, k) => (
            <span
              key={d.label}
              className={clsx("transition-colors duration-500", k === i ? (d.state === "thinking" ? "text-think" : "text-accent") : "text-[rgba(143,140,133,0.55)]")}
            >
              {d.label}
            </span>
          ))
        ) : backend === "waking" ? (
          <span className="text-think">waking up</span>
        ) : null}
      </div>
    </div>
  );
}
