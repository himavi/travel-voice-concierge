"use client";

import { motion } from "framer-motion";
import { TranscriptMessage } from "@/lib/types";
import clsx from "clsx";

interface Props {
  message: TranscriptMessage;
  /** Compact mode: smaller bubble, no avatar — used in the inline conversation view under the orb. */
  compact?: boolean;
  showTimestamp?: boolean;
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour12: true, hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

export function Message({ message, compact, showTimestamp }: Props) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={clsx("flex gap-2 items-end", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && !compact && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5"
          style={{ background: "linear-gradient(135deg, #FF6B4A, #F5A623)" }}
        >
          <span className="text-[10px] font-bold text-white">AI</span>
        </div>
      )}

      <div className={clsx("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div
          className={clsx(
            "leading-relaxed",
            compact ? "max-w-[280px] px-3 py-1.5 text-xs" : "max-w-[80%] px-3.5 py-2.5 text-sm"
          )}
          style={isUser
            ? {
                background: "linear-gradient(135deg,rgba(255,107,74,0.18),rgba(245,166,35,0.12))",
                color: "var(--ink)",
                borderRadius: "16px 16px 4px 16px",
                border: "1px solid rgba(255,107,74,0.3)",
              }
            : {
                background: "rgba(255,255,255,0.05)",
                color: "var(--ink-2)",
                borderRadius: "16px 16px 16px 4px",
                border: "1px solid var(--border)",
              }
          }
        >
          {message.text}
        </div>
        {showTimestamp && (
          <span className="text-[10px] px-1" style={{ color: "var(--ink-faint)" }}>
            {isUser ? "You" : "Aria"} · {fmtTime(message.timestamp)}
          </span>
        )}
      </div>

      {isUser && !compact && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5"
          style={{ background: "rgba(255,107,74,0.18)", border: "1px solid rgba(255,107,74,0.3)" }}
        >
          <span className="text-[10px] font-bold" style={{ color: "#FF8A65" }}>U</span>
        </div>
      )}
    </motion.div>
  );
}
