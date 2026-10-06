"use client";

import { Mic, MicOff } from "lucide-react";
import clsx from "clsx";
import { AgentStatus, VoiceMode } from "@/lib/types";
import { OrbCanvas, type OrbState } from "./OrbCanvas";

interface Props {
  status: AgentStatus;
  /** Mic is open (not muted). */
  liveMode: boolean;
  onTap: () => void;
  /** Live 0–1 mic amplitude, sampled from the real analyser each frame. */
  getInputLevel?: () => number;
  /** Rendered size in CSS px. */
  size?: number;
  /** Text mode shows a "tap for voice" standby orb instead of a muted one. */
  mode?: VoiceMode;
}

function getLabel(status: AgentStatus, liveMode: boolean, mode?: VoiceMode): string {
  if (mode === "text" && status === "idle") return "Switch to voice and talk to Aria";
  switch (status) {
    case "listening": return "Listening. Tap when you're done, or pause to send automatically";
    case "thinking":  return "Aria is thinking";
    case "speaking":  return "Aria is speaking. Tap to interrupt";
    default:          return liveMode
      ? "Microphone on. Just start talking. Tap to mute"
      : "Microphone off. Tap to talk to Aria";
  }
}

export function orbStateFor(status: AgentStatus, liveMode: boolean, mode?: VoiceMode): OrbState {
  if (status === "listening" || status === "thinking" || status === "speaking") return status;
  if (mode === "text") return "standby";
  return liveMode ? "ambient" : "muted";
}

export function VoiceOrb({ status, liveMode, onTap, getInputLevel, size = 200, mode }: Props) {
  const state = orbStateFor(status, liveMode, mode);
  const isThinking = status === "thinking";
  const isMuted = state === "muted";

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={isThinking}
      aria-label={getLabel(status, liveMode, mode)}
      className={clsx(
        "group relative rounded-full focus-round touch-manipulation select-none",
        "transition-transform duration-300 ease-out",
        !isThinking && "hover:scale-[1.02] active:scale-[0.98]",
        isThinking ? "cursor-progress" : "cursor-pointer",
      )}
      style={{ width: size, height: size, WebkitTapHighlightColor: "transparent" }}
    >
      <OrbCanvas state={state} size={size} getLevel={getInputLevel} />
      {(isMuted || state === "standby") && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          {isMuted
            ? <MicOff className="text-ink-2" style={{ width: size * 0.13, height: size * 0.13 }} strokeWidth={1.6} />
            : <Mic className="text-ink" style={{ width: size * 0.13, height: size * 0.13 }} strokeWidth={1.6} />}
        </span>
      )}
    </button>
  );
}
