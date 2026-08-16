"use client";

import { DecisionEvent } from "@/lib/types";
import { AnimatePresence, motion } from "framer-motion";

interface Props { events: DecisionEvent[]; }

const EV: Record<string, { dot: string; label: string; color: string }> = {
  INTENT_DETECTED:    { dot: "#F5A623", label: "Intent",    color: "#F5A623" },
  FIELD_EXTRACTED:    { dot: "#FF6B4A", label: "Extracted", color: "#FF8A65" },
  FIELD_MISSING:      { dot: "#D9A644", label: "Missing",   color: "#D9A644" },
  QUESTION_GENERATED: { dot: "#C97B4A", label: "Question",  color: "#C99B7A" },
  LEAD_SCORE_UPDATED: { dot: "#FF5C7A", label: "Score",     color: "#FF8CA3" },
  HANDOFF_REQUESTED:  { dot: "#F0525A", label: "Handoff",   color: "#F0838A" },
  LEAD_QUALIFIED:     { dot: "#3FCFA0", label: "Hot Lead",  color: "#3FCFA0" },
};

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ""; }
}

export function DecisionTrace({ events }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-center py-3" style={{ color: "var(--ink-faint)" }}>
        Events appear as the conversation progresses.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto overscroll-contain pr-1" role="log" aria-label="Decision trace">
      <AnimatePresence initial={false}>
        {events.map((ev, i) => {
          const s = EV[ev.event_type] || { dot: "var(--slate)", label: ev.event_type, color: "var(--slate)" };
          return (
            <motion.div
              key={`${ev.timestamp}-${ev.event_type}-${i}`}
              layout
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start gap-2 text-[11px] overflow-hidden"
            >
              <span className="font-mono w-14 flex-shrink-0 pt-0.5" style={{ color: "var(--ink-faint)" }}>
                {fmt(ev.timestamp)}
              </span>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" aria-hidden="true"
                style={{ background: s.dot, boxShadow: `0 0 6px ${s.dot}` }} />
              <div className="flex-1 min-w-0 pb-2">
                <span className="font-semibold" style={{ color: s.color }}>{s.label} </span>
                <span style={{ color: "var(--ink-dim)" }}>{ev.description}</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
