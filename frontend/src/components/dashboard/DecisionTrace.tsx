"use client";

import { DecisionEvent } from "@/lib/types";
import clsx from "clsx";

interface Props { events: DecisionEvent[]; }

const EV: Record<string, { dot: string; label: string; color: string }> = {
  INTENT_DETECTED:    { dot: "#c084fc", label: "Intent",    color: "#d8b4fe" },
  FIELD_EXTRACTED:    { dot: "#a855f7", label: "Extracted", color: "#c084fc" },
  FIELD_MISSING:      { dot: "#fbbf24", label: "Missing",   color: "#fde68a" },
  QUESTION_GENERATED: { dot: "#818cf8", label: "Question",  color: "#a5b4fc" },
  LEAD_SCORE_UPDATED: { dot: "#f472b6", label: "Score",     color: "#fbcfe8" },
  HANDOFF_REQUESTED:  { dot: "#f87171", label: "Handoff",   color: "#fca5a5" },
};

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ""; }
}

export function DecisionTrace({ events }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-center py-3" style={{ color: "#3b2f5a" }}>
        Events appear as the conversation progresses.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto pr-1" role="log" aria-label="Decision trace">
      {events.map((ev, i) => {
        const s = EV[ev.event_type] || { dot: "#6b5c8a", label: ev.event_type, color: "#9c8fc0" };
        return (
          <div key={i} className="flex items-start gap-2 text-[11px] slide-up">
            <span className="font-mono w-14 flex-shrink-0 pt-0.5" style={{ color: "#3b2f5a" }}>
              {fmt(ev.timestamp)}
            </span>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" aria-hidden="true"
              style={{ background: s.dot }} />
            <div className="flex-1 min-w-0">
              <span className="font-semibold" style={{ color: s.color }}>{s.label} </span>
              <span style={{ color: "#6b5c8a" }}>{ev.description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
