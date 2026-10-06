"use client";

import { WifiOff } from "lucide-react";
import clsx from "clsx";
import { AgentStatus, VoiceMode } from "@/lib/types";

interface Props {
  status: AgentStatus;
  /** Mic is open (not muted). */
  liveMode: boolean;
  mode: VoiceMode;
  /** Live connection still being set up. */
  connecting?: boolean;
  /** True when the last turn failed — renders the error copy instead of idle copy. */
  hasError?: boolean;
  isConnected: boolean;
}

const MODE_BADGE: Record<VoiceMode, { label: string; title: string }> = {
  live: { label: "Live", title: "Live voice: real-time, interruptible speech-to-speech" },
  lite: { label: "Lite", title: "Lite voice: Aria replies after you finish speaking" },
  text: { label: "Text", title: "Text chat: no microphone in use" },
};

function getStatusText(status: AgentStatus, liveMode: boolean, mode: VoiceMode, connecting?: boolean, hasError?: boolean): string {
  if (connecting && status === "idle") return "Connecting";
  if (hasError && status === "idle") return "Something went wrong. Try again";
  switch (status) {
    case "listening": return mode === "live" ? "Listening" : "Listening · tap when done";
    case "thinking":  return "Thinking";
    case "speaking":  return "Speaking · tap to interrupt";
    default:
      if (mode === "text") return "Type, or tap the orb to talk";
      return liveMode ? "Just start talking" : "Muted · tap the orb to resume";
  }
}

function toneFor(status: AgentStatus, hasError?: boolean) {
  if (hasError && status === "idle") return "text-danger";
  if (status === "thinking") return "text-think";
  if (status === "listening" || status === "speaking") return "text-accent";
  return "text-ink-2";
}

export function ModeBadge({ mode, isConnected }: { mode: VoiceMode; isConnected: boolean }) {
  const badge = MODE_BADGE[mode];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 h-6 px-2 rounded-md border font-mono text-[11px] font-medium leading-none",
        !isConnected
          ? "border-[rgba(240,138,126,0.4)] text-danger"
          : mode === "live"
          ? "border-accent-line text-accent"
          : "border-line-strong text-ink-2",
      )}
      title={isConnected ? badge.title : "Can't reach Aria's server"}
      role="status"
      aria-live="polite"
      data-testid="mode-badge"
    >
      {isConnected
        ? <span className={clsx("w-1.5 h-1.5 rounded-full", mode === "live" ? "bg-accent" : "bg-ink-3")} aria-hidden="true" />
        : <WifiOff className="w-3 h-3" aria-hidden="true" />}
      {isConnected ? badge.label : "Offline"}
    </span>
  );
}

export function VoiceStatus({ status, liveMode, mode, connecting, hasError, isConnected }: Props) {
  const text = getStatusText(status, liveMode, mode, connecting, hasError);
  const active = status !== "idle" || connecting;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 min-h-6 px-4">
      <ModeBadge mode={mode} isConnected={isConnected} />
      <p
        className={clsx("text-[15px] font-medium leading-6 transition-colors duration-300 inline-flex items-center gap-2", toneFor(status, hasError))}
        role="status"
        aria-live="polite"
        data-testid="voice-status"
      >
        <span
          className={clsx("w-1.5 h-1.5 rounded-full bg-current", active && "breathe")}
          aria-hidden="true"
        />
        {text}
      </p>
    </div>
  );
}
