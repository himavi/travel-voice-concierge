"use client";

import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { TranscriptMessage } from "@/lib/types";

interface Props {
  message: TranscriptMessage;
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function Message({ message }: Props) {
  const isUser = message.role === "user";
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={clsx("flex", isUser ? "justify-end" : "justify-start")}
      data-partial={message.partial ? "true" : undefined}
    >
      {isUser ? (
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-md bg-bg-overlay border border-line px-4 py-2.5">
          <p className="sr-only">You said, at {fmtTime(message.timestamp)}:</p>
          <p className={clsx("text-[15px] leading-6 break-words", message.partial ? "text-ink-2" : "text-ink")}>
            {message.text}
            {message.partial && <span className="partial-caret" aria-hidden="true" />}
          </p>
        </div>
      ) : (
        <div className="max-w-[92%] sm:max-w-[85%] flex gap-3">
          <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="sr-only">Aria said, at {fmtTime(message.timestamp)}:</p>
            <p className={clsx("text-[15px] leading-6 break-words", message.partial ? "text-ink-2" : "text-ink")}>
              {message.text}
              {message.partial && <span className="partial-caret" aria-hidden="true" />}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
