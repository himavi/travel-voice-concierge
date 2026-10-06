"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronUp, Info, X } from "lucide-react";
import clsx from "clsx";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { Header } from "@/components/layout/Header";
import { Footer, Credit } from "@/components/layout/Footer";
import { Landing, type Destination } from "@/components/landing/Landing";
import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { VoiceStatus } from "@/components/voice/VoiceStatus";
import { Conversation } from "@/components/voice/Conversation";
import { Composer } from "@/components/voice/Composer";
import { LeadScore } from "@/components/dashboard/LeadScore";
import { TravelProfile } from "@/components/dashboard/TravelProfile";
import { VisaInsight } from "@/components/dashboard/VisaInsight";
import { DecisionTrace } from "@/components/dashboard/DecisionTrace";
import { HandoffCard, HandoffSummary } from "@/components/dashboard/HandoffCard";
import { useMediaQuery } from "@/components/ui/useMediaQuery";

/** Height of the collapsed mobile dashboard sheet (its peek bar). */
const PEEK = 64;

export default function Home() {
  const {
    backend, retryHealth, mode, status, transcript, profile, events, handoff, visa, liveMode,
    isConnected, connecting, error, notice, dismissNotice, start, toggleLiveMode, sendText, getInputLevel,
  } = useVoiceAgent();
  const backendReady = backend === "ready";

  const [started, setStarted]                   = useState(false);
  const [leaving, setLeaving]                   = useState(false);
  const [handoffDismissed, setHandoffDismissed] = useState(false);
  const [textInput, setTextInput]               = useState("");
  const [isStarting, setIsStarting]             = useState(false);
  const [sheetOpen, setSheetOpen]               = useState(false);
  const [copied, setCopied]                     = useState(false);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isShort = useMediaQuery("(max-height: 700px)");
  const sheetBodyRef = useRef<HTMLDivElement>(null);

  const enterApp = () => {
    // Let the landing play its exit before the app mounts, instead of hard-cutting.
    setLeaving(true);
    setTimeout(() => setStarted(true), 360);
  };

  const handleStart = async (withVoice: boolean = true) => {
    if (!backendReady) return;
    setIsStarting(true);
    const sid = await start(withVoice);
    setIsStarting(false);
    if (!sid) return;
    enterApp();
  };

  /** Destination shortcut: a text session that opens with that trip. */
  const handleDestination = async (d: Destination) => {
    if (!backendReady) return;
    setIsStarting(true);
    const sid = await start(false);
    setIsStarting(false);
    if (!sid) return;
    enterApp();
    void sendText(`I'm planning a trip to ${"phrase" in d ? d.phrase : d.name}.`);
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    sendText(textInput);
    setTextInput("");
  };

  const handleCopy = async () => {
    const text = transcript
      .filter((m) => !m.partial)
      .map((m) => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role === "user" ? "You" : "Aria"}: ${m.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable: nothing sensible to fall back to.
    }
  };

  const dismissHandoff = useCallback(() => setHandoffDismissed(true), []);

  // A new handoff always surfaces its brief.
  useEffect(() => {
    if (handoff) setHandoffDismissed(false);
  }, [handoff]);

  // Mobile sheet: Escape closes; a collapsed sheet is inert so keyboard and
  // screen-reader users don't tab into off-screen content.
  useEffect(() => {
    if (!sheetOpen || isDesktop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheetOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen, isDesktop]);

  useEffect(() => {
    const el = sheetBodyRef.current;
    if (!el) return;
    if (!isDesktop && !sheetOpen) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }, [isDesktop, sheetOpen, started]);

  const nextField = events.find((e) => e.event_type === "QUESTION_GENERATED")?.field;
  const score = Math.max(0, Math.min(100, profile.lead_score));

  return (
    <div className={clsx("flex flex-col bg-bg", started ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]")}>
      <a href="#main" className="skip-link">Skip to content</a>

      <Header
        started={started}
        onNewSession={() => window.location.reload()}
        onCopyTranscript={handleCopy}
        canCopy={transcript.length > 0}
        copied={copied}
      />

      {/* ── Error ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="relative z-10 flex-shrink-0 overflow-hidden"
          >
            <div
              role="alert"
              className="mx-4 sm:mx-6 mt-3 flex items-start gap-2.5 rounded-xl border border-[rgba(240,138,126,0.35)] bg-[rgba(240,138,126,0.07)] px-4 py-3 text-sm text-danger"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="leading-snug">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Non-blocking notice (e.g. Live → Lite fallback) ── */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="fixed z-[45] top-[72px] inset-x-0 lg:right-[400px] xl:right-[420px] mx-auto w-[calc(100%-32px)] max-w-md flex items-start gap-3 rounded-xl border border-line-strong bg-bg-overlay pl-4 pr-1.5 py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
            role="status"
            aria-live="polite"
            data-testid="notice-toast"
          >
            <Info className="w-4 h-4 mt-[13px] flex-shrink-0 text-accent" aria-hidden="true" />
            <span className="flex-1 py-2.5 text-sm leading-snug text-ink-2">{notice}</span>
            <button onClick={dismissNotice} aria-label="Dismiss notice" className="icon-btn flex-shrink-0">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!started && (
        <>
          <Landing
            backend={backend}
            retryHealth={retryHealth}
            isStarting={isStarting}
            leaving={leaving}
            onStart={(v) => void handleStart(v)}
            onDestination={(d) => void handleDestination(d)}
          />
          <Footer />
        </>
      )}

      {started && (
        <main id="main" className="flex-1 min-h-0 flex lg:grid lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px] app-enter">
          {/* ── Conversation column ── */}
          <section
            aria-label="Conversation with Aria"
            className="flex-1 min-w-0 min-h-0 flex flex-col"
            style={isDesktop ? undefined : { paddingBottom: `calc(${PEEK}px + env(safe-area-inset-bottom))` }}
          >
            <h1 className="sr-only">Conversation with Aria</h1>

            {/* Voice stage: the single focal element */}
            <div className="stage-light flex-shrink-0 flex flex-col items-center gap-2.5 sm:gap-4 pt-4 pb-3.5 sm:pt-8 sm:pb-6 border-b border-line">
              <VoiceOrb
                status={status}
                liveMode={liveMode}
                onTap={toggleLiveMode}
                getInputLevel={getInputLevel}
                size={isDesktop ? 188 : isShort ? 96 : 120}
                mode={mode}
              />
              <VoiceStatus
                status={status}
                liveMode={liveMode}
                mode={mode}
                connecting={connecting}
                hasError={!!error}
                isConnected={isConnected}
              />
              {profile.destination && (
                <p className="hidden sm:block text-[13px] text-ink-3 -mt-1">
                  Planning <span className="text-ink-2">{profile.destination}</span>
                  {profile.travel_month && <> · <span className="text-ink-2">{profile.travel_month}</span></>}
                  {profile.passport && <> · <span className="text-ink-2">{profile.passport}</span> passport</>}
                </p>
              )}
            </div>

            <Conversation messages={transcript} />

            <div className="flex-shrink-0 border-t border-line bg-bg">
              <Composer
                value={textInput}
                onChange={setTextInput}
                onSend={handleSendText}
                mode={mode}
                status={status}
                onSwitchToVoice={toggleLiveMode}
              />
            </div>
          </section>

          {/* ── Mobile scrim ── */}
          <AnimatePresence>
            {!isDesktop && sheetOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSheetOpen(false)}
                className="fixed inset-0 z-30 bg-black/60"
                aria-hidden="true"
              />
            )}
          </AnimatePresence>

          {/* ── Dashboard: right column on desktop, bottom sheet on mobile ── */}
          <aside
            aria-label="Trip dashboard"
            role="complementary"
            className={clsx(
              "flex flex-col min-h-0",
              "fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] rounded-t-2xl border-t border-line-strong bg-bg-raised",
              "transition-transform duration-300 ease-out shadow-[0_-16px_48px_rgba(0,0,0,0.4)]",
              "lg:static lg:z-auto lg:max-h-none lg:rounded-none lg:border-t-0 lg:border-l lg:border-line lg:bg-bg lg:shadow-none lg:transition-none",
            )}
            style={isDesktop ? undefined : {
              transform: sheetOpen ? "translateY(0)" : `translateY(calc(100% - ${PEEK}px - env(safe-area-inset-bottom)))`,
            }}
          >
            {/* Mobile peek bar */}
            <button
              type="button"
              onClick={() => setSheetOpen((v) => !v)}
              aria-expanded={sheetOpen}
              aria-controls="dashboard-body"
              className="lg:hidden relative flex-shrink-0 flex items-center gap-4 px-5 text-left"
              style={{ height: PEEK }}
            >
              <span className="absolute top-2 left-1/2 -translate-x-1/2 w-9 h-1 rounded-full bg-line-strong" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold text-ink truncate">
                    {profile.destination ? `Trip to ${profile.destination}` : "Trip dashboard"}
                  </span>
                  <span className="font-mono text-[12px] text-ink-2 tabular-nums flex-shrink-0">{score}% ready</span>
                </span>
                <span className="mt-2 block h-1 rounded-full bg-line overflow-hidden" aria-hidden="true">
                  <span className="block h-full bg-accent rounded-full transition-[width] duration-700" style={{ width: `${score}%` }} />
                </span>
              </span>
              <ChevronUp className={clsx("w-5 h-5 text-ink-3 flex-shrink-0 transition-transform duration-300", sheetOpen && "rotate-180")} aria-hidden="true" />
              <span className="sr-only">{sheetOpen ? "Hide trip dashboard" : "Show trip dashboard"}</span>
            </button>

            <div
              id="dashboard-body"
              ref={sheetBodyRef}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-line lg:border-t-0"
              style={isDesktop ? undefined : { paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <LeadScore profile={profile} nextField={nextField} />
              {handoff && <HandoffSummary card={handoff} onOpen={() => setHandoffDismissed(false)} />}
              <VisaInsight info={visa} destination={profile.destination} passport={profile.passport} />
              <TravelProfile profile={profile} />
              <DecisionTrace events={events} />
              <Credit />
            </div>
          </aside>
        </main>
      )}

      {handoff && !handoffDismissed && <HandoffCard card={handoff} onDismiss={dismissHandoff} />}
    </div>
  );
}
