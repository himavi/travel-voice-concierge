"use client";

import { DecisionEvent } from "@/lib/types";
import clsx from "clsx";

interface Props { events: DecisionEvent[]; }

const EV: Record<string, { dot: string; label: string; color: string }> = {
  INTENT_DETECTED:    { dot: "#F5A623", label: "Intent",    color: "#8A5C10" },
  FIELD_EXTRACTED:    { dot: "#FF6B4A", label: "Extracted", color: "#C2401F" },
  FIELD_MISSING:      { dot: "#D9A644", label: "Missing",   color: "#8F6A1E" },
  QUESTION_GENERATED: { dot: "#C97B4A", label: "Question",  color: "#A65E32" },
  LEAD_SCORE_UPDATED: { dot: "#FF5C7A", label: "Score",     color: "#B8305A" },
  HANDOFF_REQUESTED:  { dot: "#E5484D", label: "Handoff",   color: "#C43D33" },
};

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ""; }
}

export function DecisionTrace({ events }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-center py-3" style={{ color: "#96805C" }}>
        Events appear as the conversation progresses.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto pr-1" role="log" aria-label="Decision trace">
      {events.map((ev, i) => {
        const s = EV[ev.event_type] || { dot: "#7A6248", label: ev.event_type, color: "#7A6248" };
        return (
          <div key={i} className="flex items-start gap-2 text-[11px] slide-up">
            <span className="font-mono w-14 flex-shrink-0 pt-0.5" style={{ color: "#96805C" }}>
              {fmt(ev.timestamp)}
            </span>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" aria-hidden="true"
              style={{ background: s.dot }} />
            <div className="flex-1 min-w-0">
              <span className="font-semibold" style={{ color: s.color }}>{s.label} </span>
              <span style={{ color: "#7A6248" }}>{ev.description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
