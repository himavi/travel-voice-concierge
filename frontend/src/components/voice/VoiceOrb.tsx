"use client";

import type { KeyboardEvent, MouseEvent, TouchEvent } from "react";
import { AgentStatus } from "@/lib/types";
import clsx from "clsx";

interface Props {
  status: AgentStatus;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  listening: "Listening — release to send",
  thinking: "Thinking",
  speaking: "Speaking",
  idle: "Idle. Hold to speak, or press Enter or Space to start and stop recording",
};

export function VoiceOrb({ status, onStart, onStop }: Props) {
  const isListening = status === "listening";
  const isThinking  = status === "thinking";
  const isSpeaking  = status === "speaking";
  const isIdle      = status === "idle";

  // Press and hold to record, release to send
  const handlePressStart = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (isIdle) onStart();
  };

  const handlePressEnd = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (isListening) onStop();
  };

  // Keyboard users can't "press and hold" — Enter/Space toggles recording
  // on and off instead, mirroring the mouse/touch press-hold-release flow.
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (e.repeat) return;
    if (isIdle) onStart();
    else if (isListening) onStop();
  };

  return (
    <div className="flex flex-col items-center gap-5 select-none">

      {/* Status label */}
      <p className="text-[11px] font-semibold tracking-[0.25em] uppercase transition-all duration-500"
        role="status"
        aria-live="polite"
        style={{
          color: isListening ? "#C43D33"
               : isThinking  ? "#7A5F3A"
               : isSpeaking  ? "#C2401F"
               : "#96805C",
        }}>
        {isListening && "● Listening — release to send"}
        {isThinking  && "● Thinking"}
        {isSpeaking  && "● Speaking"}
        {isIdle      && "Hold to speak"}
      </p>

      {/* Orb wrapper */}
      <div className="relative flex items-center justify-center w-40 h-40">

        {/* Orbit rings — idle */}
        {isIdle && (
          <>
            <span className="absolute inset-[-16px] rounded-full border orbit"
              style={{ borderColor: "rgba(232,82,58,0.12)", borderStyle: "dashed" }} />
            <span className="absolute inset-[-32px] rounded-full border orbit-rev"
              style={{ borderColor: "rgba(232,82,58,0.07)", borderStyle: "dashed" }} />
          </>
        )}

        {/* Pulse rings — listening */}
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full orb-ring"
              style={{ background: "rgba(229,72,77,0.18)" }} />
            <span className="absolute inset-[-16px] rounded-full border orb-ring-2"
              style={{ borderColor: "rgba(229,72,77,0.2)" }} />
            <span className="absolute inset-[-32px] rounded-full border orb-ring-3"
              style={{ borderColor: "rgba(229,72,77,0.1)" }} />
          </>
        )}

        {/* Pulse rings — speaking */}
        {isSpeaking && (
          <>
            <span className="absolute inset-0 rounded-full orb-ring"
              style={{ background: "rgba(245,166,35,0.2)" }} />
            <span className="absolute inset-[-16px] rounded-full border orb-ring-2"
              style={{ borderColor: "rgba(245,166,35,0.3)" }} />
          </>
        )}

        {/* Thinking spinner */}
        {isThinking && (
          <span className="absolute inset-[-4px] rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: "#7A5F3A" }} />
        )}

        {/* Main orb button */}
        <button
          type="button"
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressEnd}
          onTouchStart={handlePressStart}
          onTouchEnd={handlePressEnd}
          onKeyDown={handleKeyDown}
          disabled={isThinking || isSpeaking}
          aria-label={STATUS_LABEL[status]}
          aria-pressed={isListening}
          className={clsx(
            "relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300",
            isIdle      && "hover:scale-105 active:scale-95",
            isListening && "scale-110",
            isSpeaking  && "scale-105 opacity-80",
            isThinking  && "opacity-60",
          )}
          style={{
            background: isListening
              ? "radial-gradient(circle at 35% 30%, #F2726B, #C43D33)"
              : isThinking
              ? "radial-gradient(circle at 35% 30%, #D9C9B4, #B8A88F)"
              : isSpeaking
              ? "radial-gradient(circle at 35% 30%, #FFD08A, #F5A623)"
              : "radial-gradient(circle at 35% 30%, #FF8A65, #E8523A)",
            boxShadow: isListening
              ? "0 0 50px rgba(229,72,77,0.45), inset 0 1px 0 rgba(255,255,255,0.25)"
              : isThinking
              ? "0 0 20px rgba(184,146,90,0.3)"
              : isSpeaking
              ? "0 0 50px rgba(245,166,35,0.5), inset 0 1px 0 rgba(255,255,255,0.25)"
              : "0 0 50px rgba(255,107,74,0.45), 0 0 100px rgba(232,82,58,0.18), inset 0 1px 0 rgba(255,255,255,0.2)",
            cursor: isThinking || isSpeaking ? "not-allowed" : "pointer",
          }}
        >
          {/* Listening waveform */}
          {isListening && (
            <div className="flex items-center gap-1" style={{ height: 36 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-1.5 rounded-full bg-white wave-bar"
                  style={{ height: "100%", animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          )}

          {/* Speaking bars */}
          {isSpeaking && (
            <div className="flex items-center gap-0.5" style={{ height: 36 }}>
              {[...Array(7)].map((_, i) => (
                <div key={i} className="w-1 rounded-full bg-white/90 wave-bar"
                  style={{ height: "100%", animationDelay: `${i * 0.07}s` }} />
              ))}
            </div>
          )}

          {/* Thinking dots */}
          {isThinking && (
            <div className="flex items-center gap-1.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full pulse-dot"
                  style={{ background: "#7A5F3A", animationDelay: `${i * 0.22}s` }} />
              ))}
            </div>
          )}

          {/* Idle mic icon */}
          {isIdle && (
            <svg className="w-12 h-12 drop-shadow-lg" fill="none" viewBox="0 0 24 24"
              stroke="white" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
