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
        <p className="text-sm text-center" style={{ color: "#3b2f5a" }}>
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
              style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
              <span className="text-[10px] font-bold text-white">AI</span>
            </div>
          )}

          <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
            style={msg.role === "user"
              ? { background: "linear-gradient(135deg,rgba(109,40,217,0.5),rgba(124,58,237,0.35))", color: "#f3e8ff", borderRadius: "18px 18px 4px 18px", border: "1px solid rgba(168,85,247,0.3)" }
              : { background: "rgba(255,255,255,0.04)", color: "#e9d5ff", borderRadius: "18px 18px 18px 4px", border: "1px solid rgba(255,255,255,0.07)" }
            }>
            {msg.text}
          </div>

          {msg.role === "user" && (
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "rgba(124,58,237,0.25)", border: "1px solid rgba(168,85,247,0.2)" }}>
              <span className="text-[10px] font-bold" style={{ color: "#c084fc" }}>U</span>
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
