"use client";

import { useEffect, useState } from "react";

interface Props { score: number; }

function getScoreStyle(score: number) {
  if (score >= 80) return { bar: "linear-gradient(90deg,#FF6B4A,#E5484D)", text: "#C2401F", label: "🔥 Hot Lead" };
  if (score >= 60) return { bar: "linear-gradient(90deg,#FF8A5C,#F5A623)", text: "#B0521A", label: "⚡ Warm Lead" };
  if (score >= 40) return { bar: "linear-gradient(90deg,#F5A623,#E5D3AA)", text: "#7A5F3A", label: "🌱 Developing" };
  return           { bar: "linear-gradient(90deg,#E5D8C4,#D4C4AE)",         text: "#7A6248", label: "○ Early Stage" };
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
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#7A6248" }}>
        Lead Score
      </p>
      <div className="flex items-end gap-2">
        <span className="text-4xl font-bold tabular-nums" style={{ color: s.text }} aria-hidden="true">
          {displayed}
        </span>
        <span className="text-sm mb-1.5" style={{ color: "#96805C" }} aria-hidden="true">/ 100</span>
        <span className="text-xs mb-1.5 font-semibold ml-auto" style={{ color: s.text }} aria-hidden="true">
          {s.label}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(58,46,34,0.08)" }}>
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
