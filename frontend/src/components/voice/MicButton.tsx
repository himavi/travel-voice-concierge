"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import { AgentStatus } from "@/lib/types";
import clsx from "clsx";

interface Props {
  status: AgentStatus;
  onMouseDown: () => void;
  onMouseUp: () => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
  disabled?: boolean;
}

export function MicButton({ status, onMouseDown, onMouseUp, onTouchStart, onTouchEnd, disabled }: Props) {
  const isListening = status === "listening";
  const isThinking = status === "thinking";
  const isSpeaking = status === "speaking";

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Pulse rings when listening */}
      <div className="relative flex items-center justify-center">
        {isListening && (
          <>
            <span className="absolute w-24 h-24 rounded-full bg-red-500/20 mic-ring" />
            <span className="absolute w-20 h-20 rounded-full bg-red-500/25 mic-ring" style={{ animationDelay: "0.3s" }} />
          </>
        )}
        {isSpeaking && (
          <span className="absolute w-24 h-24 rounded-full bg-brand-500/20 mic-ring" />
        )}

        <button
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          disabled={disabled || isThinking}
          className={clsx(
            "relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none",
            isListening && "bg-red-500 glow-red scale-110",
            isThinking && "bg-gray-600 cursor-not-allowed",
            isSpeaking && "bg-brand-600 glow-blue",
            !isListening && !isThinking && !isSpeaking && "bg-brand-600 hover:bg-brand-500 hover:scale-105 active:scale-95",
          )}
        >
          {isThinking ? (
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          ) : isListening ? (
            <MicOff className="w-6 h-6 text-white" />
          ) : (
            <Mic className="w-6 h-6 text-white" />
          )}
        </button>
      </div>

      {/* Waveform when listening */}
      {isListening && (
        <div className="flex items-center gap-1 h-6">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="wave-bar w-1 bg-red-400 rounded-full"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 font-medium tracking-wide">
        {isListening && "Release to send"}
        {isThinking && "Processing..."}
        {isSpeaking && "Speaking..."}
        {status === "idle" && "Hold to speak"}
      </p>
    </div>
  );
}
