"use client";

import { DecisionEvent } from "@/lib/types";
import clsx from "clsx";

interface Props {
  events: DecisionEvent[];
}

const EVENT_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  INTENT_DETECTED:       { dot: "bg-purple-400",  text: "text-purple-300",  label: "Intent" },
  FIELD_EXTRACTED:       { dot: "bg-green-400",   text: "text-green-300",   label: "Extracted" },
  FIELD_MISSING:         { dot: "bg-yellow-400",  text: "text-yellow-300",  label: "Missing" },
  QUESTION_GENERATED:    { dot: "bg-blue-400",    text: "text-blue-300",    label: "Question" },
  LEAD_SCORE_UPDATED:    { dot: "bg-orange-400",  text: "text-orange-300",  label: "Score" },
  HANDOFF_REQUESTED:     { dot: "bg-red-400",     text: "text-red-300",     label: "Handoff" },
};

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function DecisionTrace({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-gray-600 text-xs">Events will appear as the conversation progresses.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
      {events.map((event, i) => {
        const style = EVENT_STYLES[event.event_type] || {
          dot: "bg-gray-400",
          text: "text-gray-300",
          label: event.event_type,
        };

        return (
          <div key={i} className="slide-up flex items-start gap-2 text-xs">
            <span className="text-gray-600 font-mono w-16 flex-shrink-0 pt-0.5">
              {formatTime(event.timestamp)}
            </span>
            <div className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5", style.dot)} />
            <div className="flex-1 min-w-0">
              <span className={clsx("font-medium", style.text)}>{style.label} </span>
              <span className="text-gray-400">{event.description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
