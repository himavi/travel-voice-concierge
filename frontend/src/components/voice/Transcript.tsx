"use client";

import { useEffect, useRef } from "react";
import { TranscriptMessage } from "@/lib/types";
import clsx from "clsx";

interface Props { messages: TranscriptMessage[]; }

export function Transcript({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-center" style={{ color: "#96805C" }}>
          Start the conversation to see the transcript here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pr-1">
      {messages.map((msg, i) => (
        <div key={i} className={clsx("slide-up flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>

          {msg.role === "assistant" && (
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "linear-gradient(135deg, #FF6B4A, #F5A623)" }}>
              <span className="text-[10px] font-bold text-white">AI</span>
            </div>
          )}

          <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
            style={msg.role === "user"
              ? { background: "linear-gradient(135deg,rgba(255,107,74,0.16),rgba(245,166,35,0.12))", color: "#3A2E22", borderRadius: "18px 18px 4px 18px", border: "1px solid rgba(255,107,74,0.25)" }
              : { background: "rgba(255,255,255,0.75)", color: "#5C4A38", borderRadius: "18px 18px 18px 4px", border: "1px solid #F0E1CC" }
            }>
            {msg.text}
          </div>

          {msg.role === "user" && (
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "rgba(255,107,74,0.15)", border: "1px solid rgba(255,107,74,0.25)" }}>
              <span className="text-[10px] font-bold" style={{ color: "#C2401F" }}>U</span>
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
