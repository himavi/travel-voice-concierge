"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AgentStatus } from "@/lib/types";

interface Props {
  status: AgentStatus;
  liveMode: boolean;
  /** True when the last turn failed — renders the Error state instead of Ready/idle copy. */
  hasError?: boolean;
}

function getStatusText(status: AgentStatus, liveMode: boolean, hasError?: boolean): string {
  if (hasError) return "Something went wrong · tap to retry";
  switch (status) {
    case "listening": return "Listening — tap when done";
    case "thinking":  return "Thinking";
    case "speaking":  return "Speaking · tap to interrupt";
    default:          return liveMode ? "Live — just start talking" : "Muted — tap to resume";
  }
}

function getStatusColor(status: AgentStatus, liveMode: boolean, hasError?: boolean): string {
  if (hasError) return "#F0525A";
  switch (status) {
    case "listening": return "#F0525A";
    case "thinking":  return "#8B93A8";
    case "speaking":  return "#F5A623";
    default:          return liveMode ? "#FF8A65" : "#5E594E";
  }
}

export function VoiceStatus({ status, liveMode, hasError }: Props) {
  const color = getStatusColor(status, liveMode, hasError);
  const text = getStatusText(status, liveMode, hasError);

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full pulse-dot"
          style={{ background: color }}
          aria-hidden="true"
        />
        <p className="text-sm font-semibold font-display tracking-tight" style={{ color: "var(--ink)" }}>
          Aria
        </p>
      </div>

      <div className="h-6 relative w-[280px]" role="status" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.p
            key={text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="text-[11px] font-semibold tracking-[0.14em] uppercase absolute inset-x-0 text-center leading-relaxed"
            style={{ color }}
          >
            {text}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
