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

// Stable stars — fixed values so server and client render identically (no hydration mismatch)
const STARS = [
  {id:0,top:"8%",left:"12%",dur:"3.2s",delay:"0s",size:2,tint:""},
  {id:1,top:"15%",left:"87%",dur:"4.1s",delay:"1.2s",size:1.5,tint:"purple"},
  {id:2,top:"5%",left:"45%",dur:"2.8s",delay:"0.5s",size:3,tint:""},
  {id:3,top:"22%",left:"67%",dur:"5.0s",delay:"2.1s",size:1.5,tint:"blue"},
  {id:4,top:"35%",left:"23%",dur:"3.7s",delay:"0.8s",size:2,tint:""},
  {id:5,top:"42%",left:"91%",dur:"4.5s",delay:"1.5s",size:1.5,tint:"purple"},
  {id:6,top:"18%",left:"34%",dur:"2.5s",delay:"3.0s",size:2,tint:"blue"},
  {id:7,top:"55%",left:"5%",dur:"6.0s",delay:"0.3s",size:1.5,tint:""},
  {id:8,top:"62%",left:"78%",dur:"3.3s",delay:"2.5s",size:2,tint:"purple"},
  {id:9,top:"70%",left:"52%",dur:"4.8s",delay:"1.0s",size:1.5,tint:""},
  {id:10,top:"12%",left:"58%",dur:"3.0s",delay:"4.0s",size:3,tint:"blue"},
  {id:11,top:"28%",left:"8%",dur:"5.5s",delay:"0.7s",size:1.5,tint:""},
  {id:12,top:"48%",left:"40%",dur:"2.7s",delay:"1.8s",size:2,tint:"purple"},
  {id:13,top:"75%",left:"18%",dur:"4.2s",delay:"3.5s",size:1.5,tint:""},
  {id:14,top:"82%",left:"72%",dur:"3.8s",delay:"0.4s",size:2,tint:"blue"},
  {id:15,top:"6%",left:"76%",dur:"5.2s",delay:"2.8s",size:1.5,tint:""},
  {id:16,top:"32%",left:"55%",dur:"3.1s",delay:"1.1s",size:2,tint:"purple"},
  {id:17,top:"58%",left:"30%",dur:"4.6s",delay:"0.6s",size:3,tint:""},
  {id:18,top:"88%",left:"45%",dur:"2.9s",delay:"2.2s",size:1.5,tint:"blue"},
  {id:19,top:"3%",left:"20%",dur:"5.8s",delay:"1.7s",size:2,tint:""},
  {id:20,top:"45%",left:"95%",dur:"3.4s",delay:"3.3s",size:1.5,tint:"purple"},
  {id:21,top:"78%",left:"88%",dur:"4.0s",delay:"0.9s",size:2,tint:""},
  {id:22,top:"25%",left:"42%",dur:"2.6s",delay:"4.5s",size:1.5,tint:"blue"},
  {id:23,top:"66%",left:"62%",dur:"5.3s",delay:"1.4s",size:2,tint:""},
  {id:24,top:"92%",left:"15%",dur:"3.6s",delay:"2.0s",size:1.5,tint:"purple"},
  {id:25,top:"38%",left:"75%",dur:"4.3s",delay:"0.2s",size:3,tint:""},
  {id:26,top:"52%",left:"22%",dur:"2.4s",delay:"3.8s",size:2,tint:"blue"},
  {id:27,top:"10%",left:"95%",dur:"5.6s",delay:"1.3s",size:1.5,tint:""},
  {id:28,top:"85%",left:"35%",dur:"3.9s",delay:"2.7s",size:2,tint:"purple"},
  {id:29,top:"72%",left:"50%",dur:"4.7s",delay:"0.1s",size:1.5,tint:""},
  {id:30,top:"20%",left:"15%",dur:"3.0s",delay:"1.9s",size:2,tint:"blue"},
  {id:31,top:"44%",left:"83%",dur:"5.1s",delay:"3.2s",size:1.5,tint:""},
  {id:32,top:"60%",left:"10%",dur:"2.8s",delay:"0.8s",size:3,tint:"purple"},
  {id:33,top:"15%",left:"70%",dur:"4.4s",delay:"2.4s",size:1.5,tint:""},
  {id:34,top:"90%",left:"60%",dur:"3.5s",delay:"1.6s",size:2,tint:"blue"},
  {id:35,top:"30%",left:"48%",dur:"5.9s",delay:"0.5s",size:1.5,tint:""},
  {id:36,top:"50%",left:"65%",dur:"3.2s",delay:"4.1s",size:2,tint:"purple"},
  {id:37,top:"76%",left:"28%",dur:"4.8s",delay:"1.0s",size:1.5,tint:""},
  {id:38,top:"4%",left:"38%",dur:"2.7s",delay:"2.6s",size:2,tint:"blue"},
  {id:39,top:"68%",left:"92%",dur:"5.4s",delay:"0.3s",size:1.5,tint:""},
];

const SHOOTS = [
  {id:0,top:"8%", left:"5%", delay:"0s",  dur:"7s"},
  {id:1,top:"22%",left:"35%",delay:"4s",  dur:"9s"},
  {id:2,top:"5%", left:"65%",delay:"11s", dur:"8s"},
];

const intentLabel: Record<string, string> = {
  visa_inquiry:  "🟣 Visa Inquiry",
  trip_planning: "🚀 Trip Planning",
  cost_inquiry:  "💜 Cost Inquiry",
  general_info:  "⭐ General Info",
  human_handoff: "🔴 Human Handoff",
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
    <div className="universe-bg text-white flex flex-col relative min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden">

      {/* ── Stars ── */}
      <div className="stars" aria-hidden="true">
        {STARS.map(s => (
          <div key={s.id} className={clsx("star", s.tint)} style={{
            top: s.top, left: s.left,
            width: s.size, height: s.size,
            ["--dur" as string]: s.dur,
            ["--delay" as string]: s.delay,
          }} />
        ))}

        {/* Shooting stars */}
        {SHOOTS.map(s => (
          <div key={s.id} className="shooting-star" style={{
            top: s.top, left: s.left, width: 80,
            animationDelay: s.delay, animationDuration: s.dur,
          }} />
        ))}
      </div>

      {/* ── Nebula ambient glow ── */}
      <div className="nebula-glow" aria-hidden="true" />

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between gap-3 flex-wrap px-4 sm:px-6 py-4 border-b border-purple-500/10 bg-black/20 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Logo — mini planet */}
          <div className="w-9 h-9 rounded-full flex items-center justify-center relative bob flex-shrink-0"
            style={{
              background: "radial-gradient(circle at 35% 35%, #a855f7, #6d28d9)",
              boxShadow: "0 0 16px rgba(168,85,247,0.5)",
            }}>
            <span className="text-lg" aria-hidden="true">🌌</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide"
              style={{ color: "#f3e8ff" }}>
              Atlys Travel Concierge
            </h1>
            <p className="text-[11px] hidden sm:block" style={{ color: "#9c8fc0" }}>
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
                    ? "text-purple-300 border-purple-500/40"
                    : "text-purple-400/60 border-purple-500/15 hover:border-purple-500/30 hover:text-purple-300",
                )}
                style={showTranscript ? { background: "rgba(124,58,237,0.18)" } : { background: "rgba(124,58,237,0.06)" }}
              >
                <MessageSquare className="w-3 h-3" aria-hidden="true" />
                Transcript
              </button>

              <div
                className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border",
                  isConnected
                    ? "text-emerald-400 border-emerald-500/20"
                    : "text-red-400 border-red-500/20"
                )}
                style={{ background: isConnected ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)" }}
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
          style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", color: "#fca5a5" }}
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
              background: "rgba(124,58,237,0.12)",
              borderColor: "rgba(168,85,247,0.25)",
              color: "#d8b4fe",
            }}>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 pulse-dot" aria-hidden="true" />
            AI Concierge · Powered by Groq
          </div>

          {/* Headline */}
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-3 leading-tight tracking-tight">
            <span style={{ color: "#f3e8ff" }}>Where in the</span>
            <br />
            <span style={{
              background: "linear-gradient(135deg, #c084fc, #a855f7, #7c3aed)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              universe
            </span>
            <span style={{ color: "#f3e8ff" }}> are you going?</span>
          </h2>

          <p className="text-sm text-center max-w-xs mb-8 leading-relaxed"
            style={{ color: "#9c8fc0" }}>
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
              background: "linear-gradient(135deg, #7c3aed, #9333ea, #a855f7)",
              boxShadow: "0 8px 32px rgba(124,58,237,0.45), 0 2px 8px rgba(0,0,0,0.5)",
            }}
          >
            <span className="relative z-10 flex items-center gap-2">
              <span className="text-base" aria-hidden="true">🚀</span>
              {isStarting ? "Launching..." : "Start Your Journey"}
            </span>
            {/* Shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </button>

          <p className="text-xs mt-4" style={{ color: "#4b3f72" }}>
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
                <p className="text-[11px]" style={{ color: "#6b5c8a" }}>{f.label}</p>
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
              showTranscript ? "h-64 border-b border-purple-500/10" : "flex-1"
            )}>
              {/* Ambient nebula glow behind orb */}
              <div aria-hidden="true" className={clsx(
                "absolute rounded-full blur-3xl pointer-events-none transition-all duration-700",
                status === "listening" && "w-96 h-96 opacity-40",
                status === "thinking"  && "w-64 h-64 opacity-25",
                status === "speaking"  && "w-96 h-96 opacity-35",
                status === "idle"      && "w-56 h-56 opacity-15",
              )}
              style={{
                background: status === "listening"
                  ? "radial-gradient(circle, #dc2626, transparent)"
                  : status === "speaking"
                  ? "radial-gradient(circle, #7c3aed, transparent)"
                  : "radial-gradient(circle, #6d28d9, transparent)",
              }} />

              {/* Destination badge */}
              {profile.destination && (
                <div className="mb-5 flex items-center gap-2 px-4 py-2 rounded-full border text-sm fade-in"
                  style={{
                    background: "rgba(124,58,237,0.12)",
                    borderColor: "rgba(168,85,247,0.22)",
                    color: "#e9d5ff",
                  }}>
                  <span className="text-base" aria-hidden="true">
                    {DESTINATIONS.find(d => d.name.toLowerCase() === profile.destination?.toLowerCase())?.flag || "🌍"}
                  </span>
                  <span className="font-semibold">{profile.destination}</span>
                  {profile.travel_month && (
                    <span style={{ color: "#9c8fc0" }}>· {profile.travel_month}</span>
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
                    style={{ color: msg.role === "assistant" ? "#e9d5ff" : "#a78bfa" }}>
                      {msg.role === "user" && (
                        <span style={{ color: "#7c3aed", marginRight: 4 }}>You:</span>
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
                      background: "rgba(124,58,237,0.08)",
                      border: "1px solid rgba(168,85,247,0.18)",
                      color: "#f3e8ff",
                    }}
                  />
                  <button
                    onClick={handleSendText}
                    disabled={!textInput.trim()}
                    aria-label="Send message"
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0 hover:scale-105"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
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
                <div className="flex items-center justify-between px-4 py-2 border-b border-purple-500/10">
                  <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "#6b5c8a" }}>
                    Transcript
                  </p>
                  <button onClick={() => setShowTranscript(false)}
                    aria-label="Close transcript"
                    className="transition-colors hover:text-white" style={{ color: "#6b5c8a" }}>
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Conversation transcript">
                  <Transcript messages={transcript} />
                </div>
                {!isVoiceActive && (
                  <div className="p-3 border-t border-purple-500/10 flex gap-2">
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
                        background: "rgba(124,58,237,0.08)",
                        border: "1px solid rgba(168,85,247,0.18)",
                        color: "#f3e8ff",
                      }}
                    />
                    <button
                      onClick={handleSendText}
                      disabled={!textInput.trim()}
                      aria-label="Send message"
                      className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
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
            style={{ borderColor: "rgba(124,58,237,0.12)", background: "rgba(5,3,15,0.5)", backdropFilter: "blur(16px)" }}
            aria-label="Conversation dashboard"
            role="complementary">

            {/* Intent */}
            {profile.intent && (
              <div className="glass rounded-2xl px-4 py-3 slide-up">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#6b5c8a" }}>Intent</p>
                <p className="text-sm font-semibold" style={{ color: "#e9d5ff" }}>
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
                style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#6b5c8a" }}>
                  Next Action
                </p>
                <p className="text-sm" style={{ color: "#c084fc" }}>
                  → Ask about {events.find(e => e.event_type === "QUESTION_GENERATED")?.field}
                </p>
              </div>
            )}

            <div className="glass rounded-2xl px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#6b5c8a" }}>
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
