"use client";

import { useState } from "react";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { Header } from "@/components/layout/Header";
import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { VoiceStatus } from "@/components/voice/VoiceStatus";
import { Conversation } from "@/components/voice/Conversation";
import { TranscriptDrawer } from "@/components/voice/TranscriptDrawer";
import { TravelProfile } from "@/components/dashboard/TravelProfile";
import { LeadScore } from "@/components/dashboard/LeadScore";
import { DecisionTrace } from "@/components/dashboard/DecisionTrace";
import { VisaInsight } from "@/components/dashboard/VisaInsight";
import { HandoffCard } from "@/components/dashboard/HandoffCard";
import { ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
    sessionId, status, transcript, profile, events, handoff, liveMode,
    isConnected, error, start, toggleLiveMode, sendText, getInputLevel,
  } = useVoiceAgent();

  const [started, setStarted]                     = useState(false);
  const [leaving, setLeaving]                     = useState(false);
  const [handoffDismissed, setHandoffDismissed]   = useState(false);
  const [showTranscript, setShowTranscript]       = useState(false);
  const [textInput, setTextInput]                 = useState("");
  const [isStarting, setIsStarting]               = useState(false);
  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);

  const handleStart = async () => {
    setIsStarting(true);
    const sid = await start();
    setIsStarting(false);
    if (!sid) return;
    // Let the landing screen play its exit animation before the app mounts,
    // instead of hard-cutting between the two views.
    setLeaving(true);
    setTimeout(() => setStarted(true), 380);
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    sendText(textInput);
    setTextInput("");
  };

  const isVoiceActive = status === "listening" || status === "speaking";
  const nextField = events.find(e => e.event_type === "QUESTION_GENERATED")?.field;

  return (
    <div className="app-bg flex flex-col relative min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden">

      {/* ── Ambient warm glow ── */}
      <div className="ambient-glow" aria-hidden="true" />

      <Header
        started={started}
        isConnected={isConnected}
        showTranscript={showTranscript}
        onToggleTranscript={() => setShowTranscript(v => !v)}
      />

      {/* ── Error ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="relative z-10 mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm border flex-shrink-0 overflow-hidden"
            style={{ background: "rgba(240,82,90,0.1)", borderColor: "rgba(240,82,90,0.3)", color: "#F0838A" }}
            role="alert">
            <span aria-hidden="true">⚠️</span> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════
          LANDING
      ════════════════════════════════ */}
      {!started && (
        <div className={clsx(
          "relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12",
          leaving && "landing-leave"
        )}>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-7 border"
            style={{
              background: "var(--surface)",
              borderColor: "rgba(255,107,74,0.3)",
              color: "var(--ink-2)",
            }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B4A] pulse-dot" aria-hidden="true" />
            AI Concierge
          </motion.div>

          {/* Headline */}
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-4xl sm:text-5xl font-semibold text-center mb-4 leading-[1.08] tracking-tight"
          >
            <span style={{ color: "var(--ink)" }}>Where in the</span>
            <br />
            <span style={{
              background: "linear-gradient(135deg, #FF6B4A, #F0563A, #E8523A)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              world
            </span>
            <span style={{ color: "var(--ink)" }}> are you headed?</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="text-sm text-center max-w-xs mb-9 leading-relaxed"
            style={{ color: "var(--ink-dim)" }}>
            Talk to Aria, and watch her build your travel and visa profile in real time.
          </motion.p>

          {/* Destination pills */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="flex flex-wrap gap-2 justify-center mb-9 max-w-md">
            {DESTINATIONS.map((d, i) => (
              <motion.span
                key={d.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.26 + i * 0.03 }}
                className="dest-pill"
              >
                {d.flag} {d.name}
              </motion.span>
            ))}
          </motion.div>

          {/* CTA button */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleStart}
            disabled={isStarting}
            aria-busy={isStarting}
            className="group relative px-8 py-4 rounded-2xl font-semibold text-white text-sm overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #FF6B4A, #FF8A5C, #F5A623)",
              boxShadow: "0 8px 32px rgba(255,107,74,0.35), 0 2px 8px rgba(232,82,58,0.3)",
            }}
          >
            <span className="relative z-10 flex items-center gap-2">
              <span className="text-base" aria-hidden="true">🎙️</span>
              {isStarting ? "Launching..." : "Start Talking"}
            </span>
            {/* Shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </motion.button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="text-xs mt-4" style={{ color: "var(--ink-faint)" }}>
            Just start talking — it's a live conversation · Or type a message
          </motion.p>

          {/* Feature row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="flex flex-wrap justify-center gap-6 sm:gap-8 mt-9">
            {[
              { icon: "🎙️", label: "Voice AI" },
              { icon: "🗺️", label: "Visa info" },
              { icon: "⚡", label: "Instant" },
              { icon: "🤝", label: "Handoff" },
            ].map(f => (
              <div key={f.label} className="text-center space-y-1">
                <div className="text-xl" aria-hidden="true">{f.icon}</div>
                <p className="text-[11px]" style={{ color: "var(--ink-dim)" }}>{f.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      )}

      {/* ════════════════════════════════
          MAIN APP
      ════════════════════════════════ */}
      {started && (
        <main className="relative z-10 flex-1 flex flex-col lg:flex-row lg:overflow-hidden app-enter">

          {/* ── Center: Voice hero + conversation ── */}
          <div className="flex-1 flex flex-col relative min-h-[70vh] lg:min-h-0 lg:overflow-hidden">

            <div className={clsx(
              "flex flex-col items-center justify-center relative transition-all duration-500 gap-5",
              showTranscript ? "h-64 border-b" : "flex-1"
            )} style={showTranscript ? { borderColor: "var(--border)" } : undefined}>
              {/* Ambient warm glow behind orb — fixed size, animated only via
                  transform/opacity so the compositor scales the already-blurred
                  layer instead of the browser re-blurring it every frame. */}
              <div aria-hidden="true"
                className="absolute w-96 h-96 rounded-full blur-3xl pointer-events-none transition-[transform,opacity] duration-700 ease-out"
                style={{
                  transform: `scale(${
                    status === "listening" || status === "speaking" ? 1
                    : status === "thinking" ? 0.68
                    : 0.58
                  })`,
                  opacity: status === "listening" ? 0.35
                    : status === "speaking" ? 0.3
                    : status === "thinking" ? 0.2
                    : 0.16,
                  background: status === "listening"
                    ? "radial-gradient(circle, #F0525A, transparent)"
                    : status === "speaking"
                    ? "radial-gradient(circle, #FF6B4A, transparent)"
                    : "radial-gradient(circle, #F5A623, transparent)",
                }} />

              {/* Destination badge */}
              <AnimatePresence>
                {profile.destination && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm"
                    style={{
                      background: "var(--surface)",
                      borderColor: "rgba(255,107,74,0.28)",
                      color: "var(--ink)",
                    }}>
                    <span className="text-base" aria-hidden="true">
                      {DESTINATIONS.find(d => d.name.toLowerCase() === profile.destination?.toLowerCase())?.flag || "🌍"}
                    </span>
                    <span className="font-semibold">{profile.destination}</span>
                    {profile.travel_month && (
                      <span style={{ color: "var(--ink-dim)" }}>· {profile.travel_month}</span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <VoiceStatus status={status} liveMode={liveMode} hasError={!!error} />

              <VoiceOrb
                status={status}
                liveMode={liveMode}
                onTap={toggleLiveMode}
                getInputLevel={getInputLevel}
              />

              {/* Compact live conversation view */}
              {!showTranscript && <Conversation messages={transcript} />}

              {/* Text input — hidden while the transcript drawer is open since
                  the drawer has its own input right below the messages;
                  showing both at once let this one visually collide with the
                  drawer header when the voice panel collapses to h-64. */}
              {!isVoiceActive && !showTranscript && (
                <div className="flex gap-2 w-full max-w-xs px-4">
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
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--ink)",
                    }}
                  />
                  <button
                    onClick={handleSendText}
                    disabled={!textInput.trim()}
                    aria-label="Send message"
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0 hover:scale-105 active:scale-95"
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
            <AnimatePresence>
              {showTranscript && (
                <TranscriptDrawer
                  messages={transcript}
                  onClose={() => setShowTranscript(false)}
                  showInput={!isVoiceActive}
                  textInput={textInput}
                  onTextInputChange={setTextInput}
                  onSend={handleSendText}
                />
              )}
            </AnimatePresence>
          </div>

          {/* ── Mobile scrim — dims the conversation behind the open insights sheet ── */}
          <AnimatePresence>
            {mobileInsightsOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileInsightsOpen(false)}
                className="lg:hidden fixed inset-0 z-30 bg-black/50"
                aria-hidden="true"
              />
            )}
          </AnimatePresence>

          {/* ── Right / bottom-sheet: Travel dashboard ──
              Desktop: static right column, always visible.
              Mobile: fixed bottom sheet — peek header always visible,
              tap to expand/collapse. No backdrop-filter here: this panel
              scrolls, and blurring a moving surface forces the browser to
              recompute the backdrop every frame. */}
          <div
            className={clsx(
              "fixed inset-x-0 bottom-0 z-40 flex flex-col",
              "lg:static lg:z-auto lg:w-[300px] lg:flex-shrink-0 lg:translate-y-0",
              "rounded-t-2xl lg:rounded-none border-t lg:border-t-0 lg:border-l",
              "transition-transform duration-300 ease-out",
              mobileInsightsOpen ? "translate-y-0" : "translate-y-[calc(100%-52px)]"
            )}
            style={{ borderColor: "var(--border)", background: "var(--canvas-2)", maxHeight: "min(80vh, 640px)" }}
          >
            {/* Mobile peek/toggle header */}
            <button
              onClick={() => setMobileInsightsOpen(v => !v)}
              aria-expanded={mobileInsightsOpen}
              className="lg:hidden flex items-center justify-between px-4 flex-shrink-0"
              style={{ height: 52 }}
            >
              <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
                Travel Profile · {profile.lead_score}%
              </span>
              <motion.span animate={{ rotate: mobileInsightsOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
                <ChevronUp className="w-4 h-4" style={{ color: "var(--ink-dim)" }} aria-hidden="true" />
              </motion.span>
            </button>

            <div
              className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5"
              aria-label="Travel profile and conversation insights"
              role="complementary"
            >
              {/* Intent */}
              <AnimatePresence>
                {profile.intent && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="glass rounded-2xl px-4 py-3 overflow-hidden">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--ink-dim)" }}>Intent</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                      {intentLabel[profile.intent] || profile.intent}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.06 }}
                className="glass rounded-2xl px-4 py-4">
                <LeadScore profile={profile} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.12 }}
                className="glass rounded-2xl px-4 py-4">
                <TravelProfile profile={profile} />
              </motion.div>

              <VisaInsight sessionId={sessionId} destination={profile.destination} passport={profile.passport} />

              <AnimatePresence>
                {nextField && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-2xl px-4 py-3 overflow-hidden"
                    style={{ background: "rgba(255,107,74,0.09)", border: "1px solid rgba(255,107,74,0.25)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--ink-dim)" }}>
                      Next Action
                    </p>
                    <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                      → Ask about {nextField}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.18 }}
                className="glass rounded-2xl px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--ink-dim)" }}>
                  AI Decision Trace
                </p>
                <DecisionTrace events={events} />
              </motion.div>
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
