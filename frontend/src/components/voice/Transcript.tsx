"use client";

import { useEffect, useRef } from "react";
import { TranscriptMessage } from "@/lib/types";
import clsx from "clsx";

interface Props {
  messages: TranscriptMessage[];
}

export function Transcript({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 text-sm text-center">
          Start the conversation to see the transcript here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={clsx(
            "slide-up flex gap-2",
            msg.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          {msg.role === "assistant" && (
            <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-white">A</span>
            </div>
          )}
          <div
            className={clsx(
              "max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
              msg.role === "user"
                ? "bg-brand-600/80 text-white rounded-br-sm"
                : "bg-white/8 text-gray-100 rounded-bl-sm border border-white/5"
            )}
          >
            {msg.text}
          </div>
          {msg.role === "user" && (
            <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-white">U</span>
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
