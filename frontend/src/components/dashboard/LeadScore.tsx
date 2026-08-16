"use client";

import { useEffect, useRef, useState } from "react";

interface Props { score: number; }

function getScoreStyle(score: number) {
  if (score >= 80) return { colorA: "#FF6B4A", colorB: "#F0525A", text: "#FF8A65", label: "🔥 Hot Lead" };
  if (score >= 60) return { colorA: "#FF8A5C", colorB: "#F5A623", text: "#F5A623", label: "⚡ Warm Lead" };
  if (score >= 40) return { colorA: "#F5A623", colorB: "#C9A96A", text: "#C9A96A", label: "🌱 Developing" };
  return           { colorA: "#5B6274", colorB: "#3A3F4C", text: "#8B93A8", label: "○ Early Stage" };
}

// Ease-out cubic — quick start, gentle settle.
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

const SIZE = 76;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function LeadScore({ score }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const s = getScoreStyle(score);
  const rafRef = useRef<number | null>(null);
  const gradId = useRef(`score-grad-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const from = displayed;
    const delta = score - from;
    if (delta === 0) return;

    const duration = 700;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplayed(Math.round(from + delta * ease(t)));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  const offset = CIRC - (Math.min(100, Math.max(0, displayed)) / 100) * CIRC;

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <defs>
            <linearGradient id={gradId.current} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={s.colorA} />
              <stop offset="100%" stopColor={s.colorB} />
            </linearGradient>
          </defs>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none"
            stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE} />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none"
            stroke={`url(#${gradId.current})`} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1)" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-display font-semibold tabular-nums" style={{ color: "var(--ink)" }} aria-hidden="true">
            {displayed}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--ink-dim)" }}>
          Lead Score
        </p>
        <p className="text-sm font-semibold truncate" style={{ color: s.text }}>
          {s.label}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--ink-faint)" }}>{displayed} / 100</p>
      </div>

      {/* Announce only the settled score, not every intermediate tick of the count-up animation */}
      <p className="sr-only" role="status" aria-live="polite">
        {displayed === score ? `Lead score ${score} out of 100, ${s.label.replace(/^\S+\s/, "")}` : ""}
      </p>
    </div>
  );
}
