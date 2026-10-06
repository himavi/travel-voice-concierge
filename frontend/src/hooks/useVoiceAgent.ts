"use client";

/**
 * Aria's conversation orchestrator.
 *
 * Three modes, best first:
 *  - "live": Gemini Live speech-to-speech straight from the browser (useLiveSession).
 *  - "lite": voice-lite fallback — record an utterance (energy endpointer),
 *            POST it as a WAV to /audio, play the returned MP3 as one clip.
 *  - "text": typed chat via /text.
 *
 * Every dashboard update arrives in the HTTP response that caused it (no
 * WebSocket to our backend). Agent status is derived locally from the player
 * and the mic endpointer, never reported by the server.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { EnergyEndpointer } from "@/lib/audio/endpointer";
import {
  AudioWorkletUnsupportedError,
  MicCapture,
  requestMicStream,
  setPlayAndRecordSession,
  startMicCapture,
  supportsAudioWorklet,
} from "@/lib/audio/micCapture";
import { PcmPlayer } from "@/lib/audio/pcmPlayer";
import { base64ToBytes, concatPcm16, encodeWav } from "@/lib/audio/wav";
import { useLiveSession, type FinalTurn, type LiveFallbackReason } from "@/hooks/useLiveSession";
import type {
  AgentStatus,
  BackendState,
  CustomerProfile,
  DecisionEvent,
  HandoffCard,
  HistoryTurn,
  TranscriptMessage,
  Turn,
  VisaInfo,
  VoiceMode,
} from "@/lib/types";

const ENABLE_LIVE = process.env.NEXT_PUBLIC_ENABLE_LIVE !== "false";
const HEALTH_TIMEOUT_MS = 60000;
/** Quiet gap after Aria stops talking before the lite mic re-arms (speaker tail). */
const LITE_COOLDOWN_MS = 350;
/** Live: show "thinking" this long after the caller stops, unless audio starts first. */
const LIVE_THINKING_WINDOW_MS = 4000;
const HISTORY_LIMIT = 30;

const DEFAULT_PROFILE: CustomerProfile = {
  session_id: "",
  destination: null,
  passport: null,
  travelers: null,
  travel_month: null,
  travel_dates: null,
  purpose: null,
  visa_required: null,
  first_schengen: null,
  budget: null,
  customer_name: null,
  lead_score: 0,
  intent: null,
  handoff_requested: false,
  created_at: "",
  updated_at: "",
};

const SEED_FIELDS = [
  "destination", "passport", "travelers", "travel_month", "travel_dates", "purpose",
  "visa_required", "first_schengen", "budget", "customer_name", "intent",
] as const;

const FALLBACK_NOTICE: Record<LiveFallbackReason, string> = {
  busy: "Live voice is busy right now, so Aria switched to Lite voice. Same conversation, slightly slower replies.",
  token_error: "Live voice is unavailable right now, so Aria switched to Lite voice.",
  connect_failed: "Couldn't open a Live voice connection, so Aria switched to Lite voice.",
  closed: "The Live voice connection dropped, so Aria switched to Lite voice. Your profile is intact.",
};

function describeError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "Couldn't reach Aria's server. Check your connection and try again.";
    if (e.status === 429) return "Aria is handling a lot of requests. Give it a few seconds and try again.";
    if (e.status === 413) return "That was a bit long. Try a shorter message.";
  }
  return fallback;
}

function nowIso() {
  return new Date().toISOString();
}

export function useVoiceAgent() {
  // ── React state (render only) ───────────────────────────────────────────
  const [backend, setBackend] = useState<BackendState>("waking");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<VoiceMode>("text");
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [partials, setPartials] = useState<{ user?: TranscriptMessage; assistant?: TranscriptMessage }>({});
  const [profile, setProfile] = useState<CustomerProfile>(DEFAULT_PROFILE);
  const [events, setEvents] = useState<DecisionEvent[]>([]);
  const [handoff, setHandoff] = useState<HandoffCard | null>(null);
  const [visa, setVisa] = useState<VisaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [networkDown, setNetworkDown] = useState(false);

  // ── Mutable runtime (read by audio callbacks; never stale) ──────────────
  const [r] = useState(() => ({
    sessionId: null as string | null,
    greeting: null as string | null,
    recreating: null as Promise<string> | null,
    mode: "text" as VoiceMode,
    status: "idle" as AgentStatus,
    micOn: false,
    profile: DEFAULT_PROFILE,
    messages: [] as TranscriptMessage[],
    ctx: null as AudioContext | null,
    player: null as PcmPlayer | null,
    stream: null as MediaStream | null,
    capture: null as MicCapture | null,
    endpointer: new EnergyEndpointer(),
    level: 0,
    busy: false,              // our own HTTP turn (text/lite) in flight
    inflight: null as TranscriptMessage | null, // typed message not yet acknowledged
    toolsPending: false,      // live tool round-trip in flight
    awaitingUntil: 0,         // live: caller stopped, waiting for Aria's audio
    awaitingTimer: null as ReturnType<typeof setTimeout> | null,
    cooldownUntil: 0,         // lite: echo guard after playback
    suppressLiveAudio: false, // live: user tapped to cut Aria off; drop rest of this turn
    noticeTimer: null as ReturnType<typeof setTimeout> | null,
  }));

  // ── Status: derived from local player + recorder only ───────────────────
  const recomputeStatus = useCallback(() => {
    let s: AgentStatus = "idle";
    const voice = r.mode === "live" || r.mode === "lite";
    if (r.player?.isPlaying) s = "speaking";
    else if (voice && r.micOn && r.endpointer.speaking) s = "listening";
    else if (r.busy || r.toolsPending || Date.now() < r.awaitingUntil) s = "thinking";
    if (s !== r.status) {
      r.status = s;
      setStatus(s);
    }
  }, [r]);

  const setModeBoth = useCallback((m: VoiceMode) => {
    r.mode = m;
    setMode(m);
  }, [r]);

  const setMicBoth = useCallback((on: boolean) => {
    r.micOn = on;
    setMicOn(on);
  }, [r]);

  const showNotice = useCallback((text: string) => {
    if (r.noticeTimer) clearTimeout(r.noticeTimer);
    setNotice(text);
    r.noticeTimer = setTimeout(() => setNotice(null), 7000);
  }, [r]);

  const addMessages = useCallback((msgs: TranscriptMessage[]) => {
    if (msgs.length === 0) return;
    r.messages = [...r.messages, ...msgs];
    setMessages(r.messages);
  }, [r]);

  const applyTurn = useCallback((turn: Turn) => {
    if (turn.profile) {
      r.profile = turn.profile;
      setProfile(turn.profile);
    }
    if (turn.events?.length) {
      // Trace shows newest first; a response's events arrive oldest first.
      const fresh = [...turn.events].reverse();
      setEvents((prev) => [...fresh, ...prev].slice(0, 50));
    }
    if (turn.handoff && turn.handoff_card) setHandoff(turn.handoff_card);
    if (turn.visa) setVisa(turn.visa);
    setError(null);
    setNetworkDown(false);
  }, [r]);

  // ── Cold start: wake the free-tier server ───────────────────────────────
  const checkHealth = useCallback(async () => {
    setBackend("waking");
    try {
      await api.health(HEALTH_TIMEOUT_MS);
      setBackend("ready");
      // Warm the Live SDK chunk so the first connect doesn't wait on it.
      if (ENABLE_LIVE) void import("@google/genai").catch(() => {});
    } catch {
      setBackend("down");
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  // ── Sessions (+ 404 recovery) ───────────────────────────────────────────
  const adoptSession = useCallback((sid: string, greeting: string | null, prof: CustomerProfile | null) => {
    r.sessionId = sid;
    setSessionId(sid);
    if (greeting) r.greeting = greeting;
    if (prof) {
      r.profile = prof;
      setProfile(prof);
    }
  }, [r]);

  const createSession = useCallback(async () => {
    const res = await api.createSession();
    adoptSession(res.session_id, res.greeting, res.profile);
    return res.session_id;
  }, [adoptSession]);

  /** The backend lost our session (restart): rebuild it from what we know. */
  const recreateSession = useCallback((staleSid: string): Promise<string> => {
    if (r.sessionId && r.sessionId !== staleSid) return Promise.resolve(r.sessionId);
    if (r.recreating) return r.recreating;
    const seed: Record<string, unknown> = {};
    for (const k of SEED_FIELDS) {
      const v = r.profile[k];
      if (v !== null && v !== undefined) seed[k] = v;
    }
    // Skip the message being sent right now: the retried call delivers it.
    const history: HistoryTurn[] = r.messages
      .filter((m) => !m.partial && m !== r.inflight)
      .slice(-HISTORY_LIMIT)
      .map(({ role, text }) => ({ role, text }));
    if (process.env.NODE_ENV !== "production") console.info("[session] 404 — recreating with seed + history");
    r.recreating = api
      .createSession({ seed_profile: seed as Partial<CustomerProfile>, history })
      .then((res) => {
        // Keep the richer local profile if the server's seeded copy lags.
        adoptSession(res.session_id, null, res.profile ?? null);
        return res.session_id;
      })
      .finally(() => {
        r.recreating = null;
      });
    return r.recreating;
  }, [r, adoptSession]);

  const withSession = useCallback(async <T,>(fn: (sid: string) => Promise<T>): Promise<T> => {
    const sid = r.sessionId ?? (await createSession());
    try {
      return await fn(sid);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        const fresh = await recreateSession(sid);
        return fn(fresh); // retry exactly once
      }
      if (e instanceof ApiError && e.status === 0) setNetworkDown(true);
      throw e;
    }
  }, [r, createSession, recreateSession]);

  // ── Text-mode greeting + mode switching ─────────────────────────────────
  const showGreetingIfEmpty = useCallback(() => {
    if (r.messages.length === 0 && r.greeting) {
      addMessages([{ role: "assistant", text: r.greeting, timestamp: nowIso() }]);
    }
  }, [r, addMessages]);

  const switchToText = useCallback((why?: string) => {
    r.capture?.stop();
    r.capture = null;
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
    r.endpointer.reset();
    setMicBoth(false);
    setModeBoth("text");
    showGreetingIfEmpty();
    if (why) showNotice(why);
    recomputeStatus();
  }, [r, setMicBoth, setModeBoth, showGreetingIfEmpty, showNotice, recomputeStatus]);

  const switchToLite = useCallback((reason: LiveFallbackReason, detail?: string) => {
    if (process.env.NODE_ENV !== "production") console.warn(`[live] fallback → lite (${reason}) ${detail ?? ""}`);
    r.player?.flush();
    r.endpointer.reset();
    r.toolsPending = false;
    r.awaitingUntil = 0;
    r.suppressLiveAudio = false;
    setPartials({});
    setConnecting(false);
    if (!r.capture) {
      switchToText("Voice isn't available right now. You can keep chatting by text.");
      return;
    }
    setModeBoth("lite");
    showGreetingIfEmpty();
    showNotice(FALLBACK_NOTICE[reason]);
    recomputeStatus();
  }, [r, setModeBoth, showGreetingIfEmpty, showNotice, switchToText, recomputeStatus]);

  // ── Live session wiring ─────────────────────────────────────────────────
  const live = useLiveSession({
    withSession,
    onAudio(pcm, rate) {
      if (r.mode !== "live" || r.suppressLiveAudio || !r.player) return;
      r.awaitingUntil = 0;
      r.player.enqueuePcm16(pcm, rate);
    },
    onInterrupted() {
      r.suppressLiveAudio = false;
      r.player?.flush();
      recomputeStatus();
    },
    onModelTurnComplete() {
      r.suppressLiveAudio = false;
      r.awaitingUntil = 0;
      setError(null);
      recomputeStatus();
    },
    onPartial(role, text, timestamp) {
      setPartials((p) => ({
        ...p,
        [role]: text === null ? undefined : { role, text, timestamp, partial: true },
      }));
    },
    onFinalTurns(turns: FinalTurn[]) {
      addMessages(turns.map((t) => ({ role: t.role, text: t.text, timestamp: t.timestamp })));
    },
    onToolsPending(pending) {
      r.toolsPending = pending;
      recomputeStatus();
    },
    onToolsTurn(turn) {
      applyTurn(turn);
    },
    onFallback(reason, detail) {
      switchToLite(reason, detail);
    },
  });

  // ── Lite turn: WAV → /audio → one MP3 clip ──────────────────────────────
  const sendLiteUtterance = useCallback(async (chunks: Int16Array[]) => {
    r.busy = true;
    recomputeStatus();
    const wav = encodeWav(concatPcm16(chunks), 16000);
    try {
      const turn = await withSession((sid) => api.audio(sid, wav));
      applyTurn(turn);
      const ts = nowIso();
      const add: TranscriptMessage[] = [];
      if (turn.user_transcript?.trim()) add.push({ role: "user", text: turn.user_transcript.trim(), timestamp: ts });
      if (turn.reply?.trim()) add.push({ role: "assistant", text: turn.reply.trim(), timestamp: ts });
      addMessages(add);
      if (!turn.user_transcript?.trim() && !turn.reply?.trim()) setError("Didn't catch that. Try again.");
      if (turn.audio_b64 && r.player && r.mode === "lite") {
        await r.player.playEncoded(base64ToBytes(turn.audio_b64)).catch(() => {
          setError("Got Aria's reply but couldn't play the audio.");
        });
      }
    } catch (e) {
      setError(describeError(e, "Couldn't process that audio. Try again."));
    } finally {
      r.busy = false;
      r.cooldownUntil = Date.now() + LITE_COOLDOWN_MS;
      r.endpointer.reset();
      recomputeStatus();
    }
  }, [r, withSession, applyTurn, addMessages, recomputeStatus]);

  // ── Mic chunk router ────────────────────────────────────────────────────
  const onMicChunk = useCallback((pcm: Int16Array, rms: number) => {
    if (!r.micOn) {
      r.level = 0;
      return;
    }
    r.level = rms;

    if (r.mode === "live") {
      // Always stream (Gemini handles barge-in); local detector only drives
      // the status, and is paused while Aria is audible so echo can't flip it.
      live.sendAudio(pcm);
      if (r.player?.isPlaying) {
        r.endpointer.reset();
        return;
      }
      const ev = r.endpointer.push(pcm, rms);
      if (ev?.type === "end") {
        r.awaitingUntil = Date.now() + LIVE_THINKING_WINDOW_MS;
        if (r.awaitingTimer) clearTimeout(r.awaitingTimer);
        r.awaitingTimer = setTimeout(recomputeStatus, LIVE_THINKING_WINDOW_MS + 20);
      }
      if (ev) recomputeStatus();
      return;
    }

    if (r.mode === "lite") {
      // Echo guard: the mic is deaf while Aria talks, while a turn is in
      // flight, and for a short tail afterwards.
      if (r.player?.isPlaying || r.busy || Date.now() < r.cooldownUntil) return;
      const ev = r.endpointer.push(pcm, rms);
      if (!ev) return;
      if (ev.type === "end") void sendLiteUtterance(ev.audio);
      else recomputeStatus();
    }
  }, [r, live, sendLiteUtterance, recomputeStatus]);

  // ── Audio bring-up ──────────────────────────────────────────────────────
  /**
   * MUST run synchronously inside the user's tap: iOS only lets an
   * AudioContext start (and play) from a gesture.
   */
  const prepareAudioInGesture = useCallback(() => {
    setPlayAndRecordSession();
    if (!r.ctx || r.ctx.state === "closed") {
      const Ctx: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      r.ctx = new Ctx();
      r.player = new PcmPlayer(r.ctx);
      r.player.onStart = () => recomputeStatus();
      r.player.onIdle = () => {
        if (r.mode === "lite") {
          r.cooldownUntil = Date.now() + LITE_COOLDOWN_MS;
          r.endpointer.reset();
        }
        recomputeStatus();
      };
    }
    void r.ctx.resume().catch(() => {});
  }, [r, recomputeStatus]);

  /** Mic + worklet, then Live (or Lite). Call after prepareAudioInGesture(). */
  const beginVoice = useCallback(async (micPromise?: Promise<MediaStream>): Promise<boolean> => {
    if (!r.ctx) return false;
    if (!supportsAudioWorklet()) {
      switchToText("Voice isn't supported in this browser. You can keep chatting by text.");
      return false;
    }
    try {
      if (!r.stream) r.stream = await (micPromise ?? requestMicStream());
    } catch {
      setError("Couldn't access your microphone. If you blocked it, allow microphone access for this site in your browser's site settings, then tap the orb again.");
      switchToText();
      return false;
    }
    try {
      if (!r.capture) r.capture = await startMicCapture(r.ctx, r.stream, onMicChunk);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("[mic] capture failed", e);
      switchToText(
        e instanceof AudioWorkletUnsupportedError
          ? "Voice isn't supported in this browser. You can keep chatting by text."
          : "Couldn't start the microphone. You can keep chatting by text.",
      );
      return false;
    }
    r.endpointer.reset();
    setMicBoth(true);

    if (ENABLE_LIVE) {
      setModeBoth("live");
      setConnecting(true);
      recomputeStatus();
      const greet = r.messages.length === 0;
      // Aria greets first on a fresh conversation; mid-conversation (e.g.
      // after Just Chat) she just starts listening. On failure
      // useLiveSession has already called onFallback → lite.
      await live.connect({ greet });
      setConnecting(false);
    } else {
      setModeBoth("lite");
      showGreetingIfEmpty();
    }
    recomputeStatus();
    return true;
  }, [r, live, onMicChunk, setMicBoth, setModeBoth, switchToText, showGreetingIfEmpty, recomputeStatus]);

  // ── Public actions ──────────────────────────────────────────────────────

  /** Landing CTA. withVoice=false is "Just Chat" (no mic prompt). */
  const start = useCallback(async (withVoice: boolean = true): Promise<string | null> => {
    setError(null);
    let micPromise: Promise<MediaStream> | undefined;
    if (withVoice) {
      prepareAudioInGesture(); // synchronous, still inside the tap
      if (supportsAudioWorklet()) {
        micPromise = requestMicStream();
        micPromise.catch(() => {}); // handled in beginVoice
      }
    }
    let sid: string;
    try {
      sid = r.sessionId ?? (await createSession());
    } catch (e) {
      setError(describeError(e, "Couldn't start a session with Aria. Try again."));
      micPromise?.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
      return null;
    }
    if (!withVoice) {
      setModeBoth("text");
      showGreetingIfEmpty();
      return sid;
    }
    await beginVoice(micPromise);
    return sid;
  }, [r, prepareAudioInGesture, createSession, setModeBoth, showGreetingIfEmpty, beginVoice]);

  /** Orb tap: start voice / barge-in / "I'm done" / mute toggle. */
  const toggleLiveMode = useCallback(() => {
    if (!r.capture) {
      prepareAudioInGesture();
      void beginVoice();
      return;
    }
    void r.ctx?.resume().catch(() => {});
    const s = r.status;
    if (s === "speaking") {
      r.player?.flush();
      if (r.mode === "live") r.suppressLiveAudio = true;
      else r.cooldownUntil = Date.now() + 150;
      recomputeStatus();
      return;
    }
    if (s === "listening") {
      if (r.mode === "lite") {
        const ev = r.endpointer.forceEnd();
        if (ev?.type === "end") void sendLiteUtterance(ev.audio);
      } else {
        r.endpointer.reset();
        live.endAudioStream();
      }
      recomputeStatus();
      return;
    }
    // Idle: mute / unmute.
    const next = !r.micOn;
    setMicBoth(next);
    r.endpointer.reset();
    if (!next && r.mode === "live") live.endAudioStream();
    if (next && r.mode === "lite") r.cooldownUntil = Date.now() + 150;
    recomputeStatus();
  }, [r, live, prepareAudioInGesture, beginVoice, sendLiteUtterance, setMicBoth, recomputeStatus]);

  const sendText = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message) return;

    if (r.mode === "live" && live.isOpen()) {
      r.player?.flush();
      if (live.sendText(message)) return;
    }

    r.player?.flush();
    const userMsg: TranscriptMessage = { role: "user", text: message, timestamp: nowIso() };
    addMessages([userMsg]);
    r.inflight = userMsg;
    r.busy = true;
    recomputeStatus();
    // Speak replies only when the caller is in a voice session.
    const tts = r.mode !== "text" && !!r.player;
    try {
      const turn = await withSession((sid) => api.text(sid, message, tts));
      applyTurn(turn);
      if (turn.reply?.trim()) addMessages([{ role: "assistant", text: turn.reply.trim(), timestamp: nowIso() }]);
      if (turn.audio_b64 && r.player && r.mode !== "text") {
        await r.player.playEncoded(base64ToBytes(turn.audio_b64)).catch(() => {});
      }
    } catch (e) {
      setError(describeError(e, "Failed to send message. Try again."));
    } finally {
      r.inflight = null;
      r.busy = false;
      recomputeStatus();
    }
  }, [r, live, addMessages, withSession, applyTurn, recomputeStatus]);

  /** 0–1 mic level for the orb (sampled every animation frame). */
  const getInputLevel = useCallback((): number => {
    if (!r.micOn) return 0;
    return Math.min(1, r.level * 7);
  }, [r]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  // ── Teardown ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      live.disconnect();
      if (r.awaitingTimer) clearTimeout(r.awaitingTimer);
      if (r.noticeTimer) clearTimeout(r.noticeTimer);
      r.capture?.stop();
      r.capture = null;
      r.stream?.getTracks().forEach((t) => t.stop());
      r.stream = null;
      r.player?.dispose();
      r.player = null;
      void r.ctx?.close().catch(() => {});
      r.ctx = null;
    };
  }, [r, live]);

  const transcript = useMemo(() => {
    const out = [...messages];
    if (partials.user) out.push(partials.user);
    if (partials.assistant) out.push(partials.assistant);
    return out;
  }, [messages, partials]);

  return {
    backend,
    retryHealth: checkHealth,
    sessionId,
    mode,
    status,
    transcript,
    profile,
    events,
    handoff,
    visa,
    isConnected: backend === "ready" && !networkDown,
    connecting,
    error,
    notice,
    dismissNotice,
    liveMode: micOn,
    start,
    toggleLiveMode,
    sendText,
    getInputLevel,
  };
}
