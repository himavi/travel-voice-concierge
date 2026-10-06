"use client";

import { ArrowUp, Mic } from "lucide-react";
import { AgentStatus, VoiceMode } from "@/lib/types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  mode: VoiceMode;
  status: AgentStatus;
  onSwitchToVoice: () => void;
}

/**
 * Text input under the transcript. While Aria is actively listening or
 * speaking the input steps aside (as before) and the same slot explains what
 * the orb is doing, so the layout doesn't jump.
 */
export function Composer({ value, onChange, onSend, mode, status, onSwitchToVoice }: Props) {
  const voiceActive = status === "listening" || status === "speaking";

  if (voiceActive) {
    return (
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-3">
        <p className="min-h-12 flex items-center justify-center text-sm text-ink-3 text-center">
          {status === "listening"
            ? "Pause when you're done, or tap the orb to send."
            : "Tap the orb to interrupt Aria."}
        </p>
      </div>
    );
  }

  return (
    <form
      className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-3 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      {mode === "text" && status !== "thinking" && (
        <button
          type="button"
          onClick={onSwitchToVoice}
          className="btn btn-secondary !min-h-12 !px-3.5 sm:!px-4 flex-shrink-0"
          aria-label="Switch to voice"
          title="Switch to voice"
        >
          <Mic className="w-[18px] h-[18px]" aria-hidden="true" />
          <span className="hidden sm:inline text-sm font-medium">Voice</span>
        </button>
      )}
      <label htmlFor="chat-input" className="sr-only">Message Aria</label>
      <input
        id="chat-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={mode === "text" ? "Message Aria" : "Or type a message"}
        autoComplete="off"
        enterKeyHint="send"
        className="field flex-1 min-w-0"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label="Send message"
        className="icon-btn !w-12 !h-12 flex-shrink-0 !bg-accent !text-accent-ink hover:!bg-[#EEC68C] disabled:!bg-bg-overlay disabled:!text-ink-3 disabled:!opacity-100"
      >
        <ArrowUp className="w-5 h-5" strokeWidth={2.2} aria-hidden="true" />
      </button>
    </form>
  );
}
