"use client";

import { useState, useRef } from "react";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { MicButton } from "@/components/voice/MicButton";
import { Transcript } from "@/components/voice/Transcript";
import { ProfilePanel } from "@/components/dashboard/ProfilePanel";
import { LeadScore } from "@/components/dashboard/LeadScore";
import { DecisionTrace } from "@/components/dashboard/DecisionTrace";
import { HandoffCard } from "@/components/dashboard/HandoffCard";
import { Radio, Wifi, WifiOff, Send } from "lucide-react";
import clsx from "clsx";

export default function Home() {
  const {
    status,
    transcript,
    profile,
    events,
    handoff,
    isConnected,
    error,
    start,
    startRecording,
    stopRecording,
    sendText,
    isRecording,
  } = useVoiceAgent();

  const [started, setStarted] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [handoffDismissed, setHandoffDismissed] = useState(false);

  const handleStart = async () => {
    await start();
    setStarted(true);
  };

  const handleMicDown = () => {
    if (!started) return;
    startRecording();
  };

  const handleMicUp = () => {
    if (!started) return;
    stopRecording();
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    sendText(textInput);
    setTextInput("");
  };

  const intentLabel: Record<string, string> = {
    visa_inquiry: "🟢 Visa Inquiry",
    trip_planning: "✈️ Trip Planning",
    cost_inquiry: "💰 Cost Inquiry",
    general_info: "ℹ️ General Info",
    human_handoff: "🔴 Human Handoff",
  };

  return (
    <div className="min-h-screen bg-[#080d1a] text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0a0f1e]/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Travel Voice Concierge</h1>
            <p className="text-xs text-gray-500">Powered by Atlys</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {started && (
            <div className={clsx("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              isConnected ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
            )}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? "Live" : "Reconnecting"}
            </div>
          )}
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      {/* Landing screen */}
      {!started ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 max-w-sm px-6">
            <div className="w-20 h-20 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center mx-auto">
              <Radio className="w-9 h-9 text-brand-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Your travel assistant is ready</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                Tell me where you want to go and I'll help with everything — visas, planning, requirements.
              </p>
            </div>
            <button
              onClick={handleStart}
              className="w-full py-3.5 bg-brand-600 hover:bg-brand-500 rounded-xl font-semibold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              Start Conversation
            </button>
            <p className="text-xs text-gray-600">No sign-up required. Free to use.</p>
          </div>
        </div>
      ) : (
        /* Main layout */
        <main className="flex-1 flex gap-0 overflow-hidden p-4 gap-4 max-h-[calc(100vh-69px)]">
          {/* Left: Conversation */}
          <div className="flex-1 flex flex-col bg-[#0d1528]/60 border border-white/5 rounded-2xl overflow-hidden min-w-0">
            {/* Conversation header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Conversation</p>
              <div className={clsx("flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full",
                status === "listening" && "text-red-400 bg-red-500/10",
                status === "thinking" && "text-yellow-400 bg-yellow-500/10",
                status === "speaking" && "text-brand-400 bg-brand-500/10",
                status === "idle" && "text-gray-500 bg-white/5",
              )}>
                <span className={clsx("w-1.5 h-1.5 rounded-full",
                  status === "listening" && "bg-red-400 pulse-dot",
                  status === "thinking" && "bg-yellow-400 pulse-dot",
                  status === "speaking" && "bg-brand-400 pulse-dot",
                  status === "idle" && "bg-gray-600",
                )} />
                {status === "listening" ? "Listening" : status === "thinking" ? "Thinking" : status === "speaking" ? "Speaking" : "Idle"}
              </div>
            </div>

            {/* Transcript */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
              <Transcript messages={transcript} />
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-white/5 space-y-3">
              {/* Mic */}
              <div className="flex justify-center">
                <MicButton
                  status={status}
                  onMouseDown={handleMicDown}
                  onMouseUp={handleMicUp}
                  onTouchStart={handleMicDown}
                  onTouchEnd={handleMicUp}
                  disabled={!started}
                />
              </div>

              {/* Text fallback */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                  placeholder="Or type a message..."
                  className="flex-1 bg-white/5 border border-white/8 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/50 focus:bg-white/8 transition-all"
                />
                <button
                  onClick={handleSendText}
                  disabled={!textInput.trim()}
                  className="w-10 h-10 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Dashboard */}
          <div className="w-80 flex flex-col gap-3 overflow-y-auto flex-shrink-0">
            {/* Intent */}
            {profile.intent && (
              <div className="bg-[#0d1528]/60 border border-white/5 rounded-2xl px-4 py-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Intent</p>
                <p className="text-sm font-medium text-white">
                  {intentLabel[profile.intent] || profile.intent}
                </p>
              </div>
            )}

            {/* Lead Score */}
            <div className="bg-[#0d1528]/60 border border-white/5 rounded-2xl px-4 py-4">
              <LeadScore score={profile.lead_score} />
            </div>

            {/* Customer Profile */}
            <div className="bg-[#0d1528]/60 border border-white/5 rounded-2xl px-4 py-4">
              <ProfilePanel profile={profile} />
            </div>

            {/* Next action hint */}
            {events.length > 0 && (
              <div className="bg-brand-600/8 border border-brand-500/20 rounded-2xl px-4 py-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Next Action</p>
                <p className="text-sm text-brand-300">
                  → {events.find(e => e.event_type === "QUESTION_GENERATED")?.field
                      ? `Ask about ${events.find(e => e.event_type === "QUESTION_GENERATED")?.field}`
                      : "Continue conversation"}
                </p>
              </div>
            )}

            {/* Decision Trace */}
            <div className="bg-[#0d1528]/60 border border-white/5 rounded-2xl px-4 py-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                Decision Trace
              </p>
              <DecisionTrace events={events} />
            </div>
          </div>
        </main>
      )}

      {/* Handoff overlay */}
      {handoff && !handoffDismissed && (
        <HandoffCard card={handoff} onDismiss={() => setHandoffDismissed(true)} />
      )}
    </div>
  );
}
