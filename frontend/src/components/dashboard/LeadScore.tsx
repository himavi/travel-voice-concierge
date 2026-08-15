"use client";

import { useEffect, useState } from "react";

interface Props { score: number; }

function getScoreStyle(score: number) {
  if (score >= 80) return { bar: "linear-gradient(90deg,#a855f7,#ec4899)", text: "#f0abfc", label: "🔥 Hot Lead" };
  if (score >= 60) return { bar: "linear-gradient(90deg,#7c3aed,#a855f7)", text: "#c084fc", label: "⚡ Warm Lead" };
  if (score >= 40) return { bar: "linear-gradient(90deg,#4f46e5,#7c3aed)", text: "#a5b4fc", label: "💜 Developing" };
  return           { bar: "linear-gradient(90deg,#374151,#4b5563)",          text: "#6b7280", label: "○ Early Stage" };
}

export function LeadScore({ score }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const s = getScoreStyle(score);

  useEffect(() => {
    if (displayed === score) return;
    const step = score > displayed ? 1 : -1;
    const t = setTimeout(() => setDisplayed(d => d + step), 18);
    return () => clearTimeout(t);
  }, [score, displayed]);

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6b5c8a" }}>
        Lead Score
      </p>
      <div className="flex items-end gap-2">
        <span className="text-4xl font-bold tabular-nums" style={{ color: s.text }} aria-hidden="true">
          {displayed}
        </span>
        <span className="text-sm mb-1.5" style={{ color: "#4b3f72" }} aria-hidden="true">/ 100</span>
        <span className="text-xs mb-1.5 font-semibold ml-auto" style={{ color: s.text }} aria-hidden="true">
          {s.label}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${score}%`, background: s.bar }} />
      </div>
      {/* Announce only the settled score, not every intermediate tick of the count-up animation */}
      <p className="sr-only" role="status" aria-live="polite">
        {displayed === score ? `Lead score ${score} out of 100, ${s.label.replace(/^\S+\s/, "")}` : ""}
      </p>
    </div>
  );
}
