"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { TranscriptMessage } from "@/lib/types";
import { Message } from "./Message";

interface Props {
  messages: TranscriptMessage[];
}

/**
 * Full transcript. Sticks to the bottom while the reader is at the bottom,
 * and leaves them alone if they scrolled up to re-read something.
 *
 * Screen readers get one polite announcement per *finished* message (via a
 * separate live region) instead of every growing partial from Live mode.
 */
export function Conversation({ messages }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Keep pinned to the bottom when the viewport changes height (mobile
  // keyboard, sheet opening) so the latest line stays visible.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lastFinal = [...messages].reverse().find((m) => !m.partial);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
      tabIndex={-1}
    >
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-ink-3 pt-6">
            Say hello, or type a message below.
          </p>
        ) : (
          <ol className="space-y-5" aria-label="Conversation transcript">
            {messages.map((msg, i) => (
              <li key={`${msg.role}-${msg.timestamp}-${i}`}>
                <Message message={msg} />
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="sr-only" role="log" aria-live="polite" aria-atomic="true">
        {lastFinal ? `${lastFinal.role === "user" ? "You" : "Aria"}: ${lastFinal.text}` : ""}
      </p>
    </div>
  );
}
