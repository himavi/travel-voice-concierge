"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

interface Props {
  score: number;
}

function getScoreColor(score: number) {
  if (score >= 80) return { bar: "bg-gradient-to-r from-orange-500 to-red-500", text: "text-orange-400", label: "🔥 Hot Lead" };
  if (score >= 60) return { bar: "bg-gradient-to-r from-yellow-500 to-orange-400", text: "text-yellow-400", label: "⚡ Warm Lead" };
  if (score >= 40) return { bar: "bg-gradient-to-r from-blue-500 to-cyan-400", text: "text-blue-400", label: "💧 Developing" };
  return { bar: "bg-gradient-to-r from-gray-600 to-gray-500", text: "text-gray-400", label: "○ Early Stage" };
}

export function LeadScore({ score }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const colors = getScoreColor(score);

  // Animate the number
  useEffect(() => {
    if (displayed === score) return;
    const step = score > displayed ? 1 : -1;
    const timer = setTimeout(() => setDisplayed((d) => d + step), 20);
    return () => clearTimeout(timer);
  }, [score, displayed]);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
        Lead Score
      </p>

      <div className="flex items-end gap-2">
        <span className={clsx("text-4xl font-bold tabular-nums", colors.text)}>
          {displayed}
        </span>
        <span className="text-gray-500 text-sm mb-1.5">/ 100</span>
        <span className={clsx("text-sm mb-1.5 font-medium ml-auto", colors.text)}>
          {colors.label}
        </span>
      </div>

      {/* Score bar */}
      <div className="w-full h-2 bg-white/8 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all duration-700 ease-out", colors.bar)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
