"use client";

import { useState } from "react";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { Transcript } from "@/components/voice/Transcript";
import { ProfilePanel } from "@/components/dashboard/ProfilePanel";
import { LeadScore } from "@/components/dashboard/LeadScore";
import { DecisionTrace } from "@/components/dashboard/DecisionTrace";
import { HandoffCard } from "@/components/dashboard/HandoffCard";
import { Wifi, WifiOff, MessageSquare, X } from "lucide-react";
import clsx from "clsx";

const DESTINATIONS = [
  { flag: "🇫🇷", name: "France" },
  { flag: "🇯🇵", name: "Japan" },
  { flag: "🇮🇹", name: "Italy" },
  { flag: "🇦🇪", name: "Dubai" },
  { flag: "🇺🇸", name: "USA" },
  { flag: "🇬🇧", name: "UK" },
  { flag: "🇹🇭", name: "Thailand" },
  { flag: "🇦🇺", name: "Australia" },
];

const intentLabel: Record<string, string> = {
  visa_inquiry:  "🛂 Visa Inquiry",
  trip_planning: "✈️ Trip Planning",
  cost_inquiry:  "💰 Cost Inquiry",
  general_info:  "⭐ General Info",
  human_handoff: "🤝 Human Handoff",
};

export default function Home() {
  const {
    status, transcript, profile, events, handoff,
    isConnected, error, start, startRecording, stopRecording, sendText,
  } = useVoiceAgent();

  const [started, setStarted]                   = useState(false);
  const [handoffDismissed, setHandoffDismissed] = useState(false);
  const [showTranscript, setShowTranscript]     = useState(false);
  const [textInput, setTextInput]               = useState("");
  const [isStarting, setIsStarting]             = useState(false);

  const handleStart = async () => {
    setIsStarting(true);
    const sid = await start();
    setIsStarting(false);
    if (sid) setStarted(true);
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    sendText(textInput);
    setTextInput("");
  };

  const isVoiceActive = status === "listening" || status === "speaking";

  return (
    <div className="app-bg flex flex-col relative min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden">

      {/* ── Ambient warm glow ── */}
      <div className="ambient-glow" aria-hidden="true" />

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between gap-3 flex-wrap px-4 sm:px-6 py-4 border-b border-[#F0E1CC] bg-white/40 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="w-9 h-9 rounded-full flex items-center justify-center relative bob flex-shrink-0"
            style={{
              background: "radial-gradient(circle at 35% 35%, #FF8A65, #E8523A)",
              boxShadow: "0 0 16px rgba(255,107,74,0.4)",
            }}>
            <span className="text-lg" aria-hidden="true">✈️</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide"
              style={{ color: "#3A2E22" }}>
              Atlys Travel Concierge
            </h1>
            <p className="text-[11px] hidden sm:block" style={{ color: "#7A6248" }}>
              AI-powered visa &amp; travel assistant
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {started && (
            <>
              <button
                onClick={() => setShowTranscript(v => !v)}
                aria-pressed={showTranscript}
                aria-label={showTranscript ? "Hide transcript" : "Show transcript"}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                  showTranscript
                    ? "text-[#C2401F] border-[rgba(255,107,74,0.4)]"
                    : "text-[#96805C] border-[#F0E1CC] hover:border-[rgba(255,107,74,0.3)] hover:text-[#C2401F]",
                )}
                style={showTranscript ? { background: "rgba(255,107,74,0.12)" } : { background: "rgba(255,255,255,0.5)" }}
              >
                <MessageSquare className="w-3 h-3" aria-hidden="true" />
                Transcript
              </button>

              <div
                className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border",
                  isConnected
                    ? "text-emerald-700 border-emerald-500/25"
                    : "text-[#C43D33] border-[rgba(229,72,77,0.3)]"
                )}
                style={{ background: isConnected ? "rgba(16,185,129,0.08)" : "rgba(229,72,77,0.08)" }}
                role="status"
                aria-live="polite"
              >
                {isConnected ? <Wifi className="w-3 h-3" aria-hidden="true" /> : <WifiOff className="w-3 h-3" aria-hidden="true" />}
                {isConnected ? "Live" : "Offline"}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Error ── */}
      {error && (
        <div className="relative z-10 mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm border flex-shrink-0"
          style={{ background: "rgba(229,72,77,0.08)", borderColor: "rgba(229,72,77,0.25)", color: "#B23A2E" }}
          role="alert">
          <span aria-hidden="true">⚠️</span> {error}
        </div>
      )}

      {/* ════════════════════════════════
          LANDING
      ════════════════════════════════ */}
      {!started && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-10">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 border"
            style={{
              background: "rgba(255,107,74,0.10)",
              borderColor: "rgba(255,107,74,0.28)",
              color: "#5C4A38",
            }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B4A] pulse-dot" aria-hidden="true" />
            AI Concierge · Powered by Groq
          </div>

          {/* Headline */}
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-3 leading-tight tracking-tight">
            <span style={{ color: "#3A2E22" }}>Where in the</span>
            <br />
            <span style={{
              background: "linear-gradient(135deg, #FF6B4A, #F0563A, #E8523A)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              world
            </span>
            <span style={{ color: "#3A2E22" }}> are you headed?</span>
          </h2>

          <p className="text-sm text-center max-w-xs mb-8 leading-relaxed"
            style={{ color: "#7A6248" }}>
            Just talk. I'll handle visas, requirements, and everything in between.
          </p>

          {/* Destination pills */}
          <div className="flex flex-wrap gap-2 justify-center mb-8 max-w-md">
            {DESTINATIONS.map(d => (
              <span key={d.name} className="dest-pill">{d.flag} {d.name}</span>
            ))}
          </div>

          {/* CTA button */}
          <button
            onClick={handleStart}
            disabled={isStarting}
            aria-busy={isStarting}
            className="group relative px-8 py-4 rounded-2xl font-semibold text-white text-sm overflow-hidden transition-all duration-300 hover:scale-[1.04] active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #FF6B4A, #FF8A5C, #F5A623)",
              boxShadow: "0 8px 32px rgba(255,107,74,0.4), 0 2px 8px rgba(232,82,58,0.25)",
            }}
          >
            <span className="relative z-10 flex items-center gap-2">
              <span className="text-base" aria-hidden="true">✈️</span>
              {isStarting ? "Launching..." : "Start Your Journey"}
            </span>
            {/* Shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </button>

          <p className="text-xs mt-4" style={{ color: "#96805C" }}>
            Hold mic to speak · Or type a message
          </p>

          {/* Feature row */}
          <div className="flex flex-wrap justify-center gap-6 sm:gap-8 mt-8">
            {[
              { icon: "🎙️", label: "Voice AI" },
              { icon: "🗺️", label: "Visa info" },
              { icon: "⚡", label: "Instant" },
              { icon: "🤝", label: "Handoff" },
            ].map(f => (
              <div key={f.label} className="text-center space-y-1">
                <div className="text-xl" aria-hidden="true">{f.icon}</div>
                <p className="text-[11px]" style={{ color: "#7A6248" }}>{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════
          MAIN APP
      ════════════════════════════════ */}
      {started && (
        <main className="relative z-10 flex-1 flex flex-col lg:flex-row lg:overflow-hidden">

          {/* ── Left: Voice panel ── */}
          <div className="flex-1 flex flex-col relative min-h-[70vh] lg:min-h-0 lg:overflow-hidden">

            <div className={clsx(
              "flex flex-col items-center justify-center relative transition-all duration-500",
              showTranscript ? "h-64 border-b border-[#F0E1CC]" : "flex-1"
            )}>
              {/* Ambient warm glow behind orb */}
              <div aria-hidden="true" className={clsx(
                "absolute rounded-full blur-3xl pointer-events-none transition-all duration-700",
                status === "listening" && "w-96 h-96 opacity-40",
                status === "thinking"  && "w-64 h-64 opacity-25",
                status === "speaking"  && "w-96 h-96 opacity-35",
                status === "idle"      && "w-56 h-56 opacity-20",
              )}
              style={{
                background: status === "listening"
                  ? "radial-gradient(circle, #E5484D, transparent)"
                  : status === "speaking"
                  ? "radial-gradient(circle, #FF6B4A, transparent)"
                  : "radial-gradient(circle, #F5A623, transparent)",
              }} />

              {/* Destination badge */}
              {profile.destination && (
                <div className="mb-5 flex items-center gap-2 px-4 py-2 rounded-full border text-sm fade-in"
                  style={{
                    background: "rgba(255,107,74,0.10)",
                    borderColor: "rgba(255,107,74,0.22)",
                    color: "#3A2E22",
                  }}>
                  <span className="text-base" aria-hidden="true">
                    {DESTINATIONS.find(d => d.name.toLowerCase() === profile.destination?.toLowerCase())?.flag || "🌍"}
                  </span>
                  <span className="font-semibold">{profile.destination}</span>
                  {profile.travel_month && (
                    <span style={{ color: "#7A6248" }}>· {profile.travel_month}</span>
                  )}
                </div>
              )}

              <VoiceOrb
                status={status}
                onStart={startRecording}
                onStop={stopRecording}
              />

              {/* Floating last messages */}
              {!showTranscript && transcript.length > 0 && (
                <div className="mt-6 max-w-sm px-6 text-center space-y-2" aria-live="polite">
                  {transcript.slice(-2).map((msg, i, arr) => (
                    <p key={i} className={clsx("leading-relaxed slide-up transition-all duration-500",
                      msg.role === "assistant" ? "text-sm" : "text-xs",
                      i === 0 && arr.length === 2 ? "opacity-30" : "opacity-90"
                    )}
                    style={{ color: msg.role === "assistant" ? "#5C4A38" : "#C2401F" }}>
                      {msg.role === "user" && (
                        <span style={{ color: "#C2401F", marginRight: 4 }}>You:</span>
                      )}
                      {msg.text}
                    </p>
                  ))}
                </div>
              )}

              {/* Text input */}
              {!isVoiceActive && (
                <div className="mt-6 flex gap-2 w-full max-w-xs px-4">
                  <label htmlFor="chat-input" className="sr-only">Type a message</label>
                  <input
                    id="chat-input"
                    type="text"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSendText()}
                    placeholder="Or type here..."
                    className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,0.75)",
                      border: "1px solid #F0E1CC",
                      color: "#3A2E22",
                    }}
                  />
                  <button
                    onClick={handleSendText}
                    disabled={!textInput.trim()}
                    aria-label="Send message"
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0 hover:scale-105"
                    style={{ background: "linear-gradient(135deg, #FF6B4A, #F5A623)" }}
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Transcript drawer */}
            {showTranscript && (
              <div className="flex-1 overflow-hidden flex flex-col fade-in">
                <div className="flex items-center justify-between px-4 py-2 border-b border-[#F0E1CC]">
                  <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "#7A6248" }}>
                    Transcript
                  </p>
                  <button onClick={() => setShowTranscript(false)}
                    aria-label="Close transcript"
                    className="transition-colors hover:text-[#3A2E22]" style={{ color: "#7A6248" }}>
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Conversation transcript">
                  <Transcript messages={transcript} />
                </div>
                {!isVoiceActive && (
                  <div className="p-3 border-t border-[#F0E1CC] flex gap-2">
                    <label htmlFor="transcript-chat-input" className="sr-only">Type a message</label>
                    <input
                      id="transcript-chat-input"
                      type="text"
                      value={textInput}
                      onChange={e => setTextInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSendText()}
                      placeholder="Type a message..."
                      className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                      style={{
                        background: "rgba(255,255,255,0.75)",
                        border: "1px solid #F0E1CC",
                        color: "#3A2E22",
                      }}
                    />
                    <button
                      onClick={handleSendText}
                      disabled={!textInput.trim()}
                      aria-label="Send message"
                      className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #FF6B4A, #F5A623)" }}
                    >
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right: Dashboard ── */}
          <div className="w-full lg:w-[296px] lg:flex-shrink-0 lg:overflow-y-auto p-3 space-y-2.5 border-t lg:border-t-0 lg:border-l"
            style={{ borderColor: "#F0E1CC", background: "rgba(255,251,244,0.6)", backdropFilter: "blur(16px)" }}
            aria-label="Conversation dashboard"
            role="complementary">

            {/* Intent */}
            {profile.intent && (
              <div className="glass rounded-2xl px-4 py-3 slide-up">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#7A6248" }}>Intent</p>
                <p className="text-sm font-semibold" style={{ color: "#3A2E22" }}>
                  {intentLabel[profile.intent] || profile.intent}
                </p>
              </div>
            )}

            <div className="glass rounded-2xl px-4 py-4">
              <LeadScore score={profile.lead_score} />
            </div>

            <div className="glass rounded-2xl px-4 py-4">
              <ProfilePanel profile={profile} />
            </div>

            {events.find(e => e.event_type === "QUESTION_GENERATED")?.field && (
              <div className="rounded-2xl px-4 py-3 slide-up"
                style={{ background: "rgba(255,107,74,0.08)", border: "1px solid rgba(255,107,74,0.22)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#7A6248" }}>
                  Next Action
                </p>
                <p className="text-sm" style={{ color: "#5C4A38" }}>
                  → Ask about {events.find(e => e.event_type === "QUESTION_GENERATED")?.field}
                </p>
              </div>
            )}

            <div className="glass rounded-2xl px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#7A6248" }}>
                Decision Trace
              </p>
              <DecisionTrace events={events} />
            </div>
          </div>
        </main>
      )}

      {handoff && !handoffDismissed && (
        <HandoffCard card={handoff} onDismiss={() => setHandoffDismissed(true)} />
      )}
    </div>
  );
}
