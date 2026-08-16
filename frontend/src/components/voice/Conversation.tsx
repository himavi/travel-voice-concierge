"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { TranscriptMessage } from "@/lib/types";
import { Message } from "./Message";

interface Props {
  messages: TranscriptMessage[];
  /** How many most-recent messages to keep mounted. */
  limit?: number;
}

export function Conversation({ messages, limit = 4 }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const visible = messages.slice(-limit);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (visible.length === 0) return null;

  return (
    <div
      className="w-full max-w-md px-4 relative"
      aria-live="polite"
      aria-label="Recent conversation"
    >
      {/* Fade the top edge so older messages scrolling off feel like they trail away, not clip */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-6 pointer-events-none z-10"
        style={{ background: "linear-gradient(to bottom, var(--canvas), transparent)" }}
      />
      <div className="max-h-[168px] overflow-y-auto overscroll-contain space-y-2 py-2 no-scrollbar">
        <AnimatePresence initial={false}>
          {visible.map((msg, i) => (
            <Message key={`${msg.timestamp}-${i}`} message={msg} compact />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
