"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { DecisionEvent } from "@/lib/types";

interface Props { events: DecisionEvent[]; }

// Tag text doubles as the event's human name. Colour is reserved: accent for
// data captured, cool for model reasoning, red only for escalation.
const EV: Record<string, { label: string; cls: string }> = {
  FIELD_EXTRACTED:    { label: "Extracted", cls: "text-accent border-accent-line" },
  INTENT_DETECTED:    { label: "Intent",    cls: "text-think border-[rgba(169,177,191,0.35)]" },
  QUESTION_GENERATED: { label: "Question",  cls: "text-think border-[rgba(169,177,191,0.35)]" },
  LEAD_SCORE_UPDATED: { label: "Score",     cls: "text-ink-2 border-line-strong" },
  FIELD_MISSING:      { label: "Missing",   cls: "text-ink-3 border-line-strong" },
  LEAD_QUALIFIED:     { label: "Qualified", cls: "text-ok border-[rgba(147,201,164,0.4)]" },
  HANDOFF_REQUESTED:  { label: "Handoff",   cls: "text-danger border-[rgba(240,138,126,0.4)]" },
};

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Why Aria did what she did: every extraction, score change, follow-up
 * question and escalation, newest first. Always open on desktop; collapsed
 * behind a toggle on small screens so it doesn't compete with the profile.
 */
export function DecisionTrace({ events }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby="trace-title" className="px-5 py-5 border-b border-line">
      <div className="flex items-center justify-between gap-3 min-h-6">
        <h2 id="trace-title" className="text-[13px] font-semibold text-ink-2 tracking-[0.01em]">
          Decision trace
        </h2>
        <span className="hidden lg:inline font-mono text-[11px] text-ink-3 tabular-nums">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="trace-body"
          className="lg:hidden -my-2.5 -mr-2 inline-flex items-center gap-1.5 min-h-11 px-2 rounded-md font-mono text-[11px] text-ink-3 hover:text-ink-2"
        >
          {events.length} event{events.length === 1 ? "" : "s"}
          <span className="sr-only">{open ? ", hide decision trace" : ", show decision trace"}</span>
          <ChevronDown className={clsx("w-4 h-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>

      <div id="trace-body" className={clsx("mt-4", open ? "block" : "hidden lg:block")}>
        {events.length === 0 ? (
          <p className="font-mono text-[12px] text-ink-3">Waiting for the first turn…</p>
        ) : (
          <ol className="space-y-px" role="log" aria-live="off" aria-label="Decision trace">
            {events.map((ev, i) => {
              const s = EV[ev.event_type] ?? { label: ev.event_type, cls: "text-ink-3 border-line-strong" };
              return (
                <li
                  key={`${ev.timestamp}-${ev.event_type}-${i}`}
                  className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-2.5 py-1.5"
                >
                  <time dateTime={ev.timestamp} className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {fmt(ev.timestamp)}
                  </time>
                  <span className={clsx("font-mono text-[10.5px] leading-[18px] w-[74px] text-center rounded border", s.cls)}>
                    {s.label}
                  </span>
                  <span className="text-[12.5px] leading-[18px] text-ink-2 min-w-0 break-words">{ev.description}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
