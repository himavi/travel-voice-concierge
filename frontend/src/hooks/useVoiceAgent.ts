"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CustomerProfile,
  DecisionEvent,
  TranscriptMessage,
  HandoffCard,
  AgentStatus,
} from "@/lib/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

// Voice-activity tuning for the continuous, always-listening session (no tap
// needed between turns — closer to how ChatGPT/Gemini voice mode feels).
// We only have amplitude to go on (no live transcript to judge whether a
// pause is mid-thought or mid-sentence), so this is a real trade-off knob:
// too short and it clips people mid-sentence, too long and every reply
// feels sluggish since the agent won't even start thinking until the timer
// elapses. 1.8s lands closer to how a normal conversational beat feels —
// tolerant of a breath or "um", without a long dead-air tax on every turn.
// If you know you're done, tap the orb — that skips the wait entirely.
const SPEECH_VOLUME_THRESHOLD = 8;  // byte-deviation peak counted as "speaking"
const MIN_RECORDING_MS = 500;       // never auto-stop before this — gives the caller a beat to start
const SILENCE_TIMEOUT_MS = 1800;    // quiet time after speech before we auto-send
const MAX_RECORDING_MS = 30000;     // hard cap in case VAD never sees silence
const VOLUME_SAMPLE_MS = 60;        // sampling interval — fine-grained enough to catch onset and soft trailing words
const RESUME_COOLDOWN_MS = 500;     // pause listening-for-onset briefly after the agent finishes speaking, so speaker bleed/echo isn't picked up as the next turn

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

export function useVoiceAgent() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [profile, setProfile] = useState<CustomerProfile>(DEFAULT_PROFILE);
  const [events, setEvents] = useState<DecisionEvent[]>([]);
  const [handoff, setHandoff] = useState<HandoffCard | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const statusRef = useRef<AgentStatus>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Backend now sends one reply as several sentence-by-sentence audio_chunk
  // messages (streaming TTS) instead of one big clip — queue them and play
  // back-to-back rather than letting each new chunk cut off the last one.
  const audioQueueRef = useRef<string[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persistent mic stream + volume metering — acquired once per session and
  // reused for every turn, so the continuous loop never has to re-request
  // getUserMedia mid-conversation.
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const maxVolumeRef = useRef(0);

  // Continuous-listening loop state
  const liveModeRef = useRef(false);
  const livePhaseRef = useRef<"idle" | "recording">("idle");
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeAtRef = useRef(0);
  const recordingStartRef = useRef(0);
  const lastSpeechTimeRef = useRef(0);

  // Keep refs in sync with the state the loop's interval callback needs to
  // read fresh each tick without being recreated on every render.
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // ── Audio playback ────────────────────────────────────────────────────────

  const stopCurrentAudio = useCallback(() => {
    // Barge-in / starting a fresh turn both mean "throw away whatever's
    // queued", not just the clip currently playing.
    audioQueueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  }, []);

  const playNextInQueue = useCallback(() => {
    const next = audioQueueRef.current.shift();
    if (!next) {
      currentAudioRef.current = null;
      // Brief cooldown before the continuous loop starts listening for
      // onset again, so any speaker bleed/echo tail isn't mistaken for
      // the start of the next turn. Only fires once the whole queue (i.e.
      // the whole reply) has finished playing.
      resumeAtRef.current = Date.now() + RESUME_COOLDOWN_MS;
      setStatus("idle");
      return;
    }
    try {
      const binary = atob(next);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => {
        URL.revokeObjectURL(url);
        playNextInQueue();
      };
    } catch {
      playNextInQueue();
    }
  }, []);

  const playAudio = useCallback((base64: string) => {
    audioQueueRef.current.push(base64);
    // If nothing's playing right now, this chunk starts immediately —
    // otherwise it waits its turn behind whatever's already queued.
    if (!currentAudioRef.current) playNextInQueue();
  }, [playNextInQueue]);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const connectWS = useCallback((sid: string) => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

    // Close existing
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const ws = new WebSocket(`${WS_URL}/ws/${sid}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimerRef.current = setTimeout(() => connectWS(sid), 2000);
    };

    ws.onerror = () => {
      // onclose handles reconnect
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; data: Record<string, unknown>; timestamp: string };

        switch (msg.type) {
          case "transcript":
            setTranscript((prev) => [
              ...prev,
              {
                role: msg.data.role as "user" | "assistant",
                text: msg.data.text as string,
                timestamp: msg.timestamp,
              },
            ]);
            break;

          case "profile_update":
            setProfile(msg.data as unknown as CustomerProfile);
            break;

          case "decision_event":
            setEvents((prev) => [msg.data as unknown as DecisionEvent, ...prev].slice(0, 50));
            break;

          case "handoff":
            setHandoff(msg.data as unknown as HandoffCard);
            break;

          case "status":
            setStatus(msg.data.status as AgentStatus);
            break;

          case "audio_chunk":
            setStatus("speaking");
            playAudio(msg.data.audio as string);
            break;

          case "error":
            setError(msg.data.message as string);
            setStatus("idle");
            break;

          case "pong":
            break;
        }
      } catch {
        // ignore malformed
      }
    };
  }, [playAudio]);

  // ── Session init ──────────────────────────────────────────────────────────

  const initSession = useCallback(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSessionId(data.session_id);
        sessionIdRef.current = data.session_id;
        setError(null);
        return data.session_id as string;
      } catch {
        if (attempt === 3) {
          setError(`Backend not reachable at ${BACKEND_URL}. Make sure the backend terminal is running.`);
          return null;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    return null;
  }, []);

  // ── Mic acquisition ──────────────────────────────────────────────────────
  // Acquired once per session and reused for the whole continuous loop.
  const getMicStream = useCallback(async (): Promise<MediaStream> => {
    if (micStreamRef.current && micStreamRef.current.getAudioTracks().some(t => t.readyState === "live")) {
      return micStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      }
    });
    micStreamRef.current = stream;

    const audioCtx = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = audioCtx;
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;

    return stream;
  }, []);

  // Read-only live mic level for the orb's audio-reactive rendering — a
  // getter (not React state) so a requestAnimationFrame loop can sample it
  // every frame without forcing a re-render. Purely additive: reads the
  // same analyser the VAD loop already uses, never touches recording.
  const getInputLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const deviation = Math.abs(data[i] - 128);
      if (deviation > peak) peak = deviation;
    }
    return Math.min(1, peak / 90);
  }, []);

  // ── Send audio ────────────────────────────────────────────────────────────

  const sendAudio = useCallback(async (blob: Blob) => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    setStatus("thinking");

    // Safety net — never hang forever
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => setStatus("idle"), 25000);

    const formData = new FormData();
    formData.append("audio", blob, "audio.webm");

    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sid}/audio`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);

      if (data.audio) {
        setStatus("speaking");
        playAudio(data.audio);
      } else if (!data.transcript) {
        setError("Didn't catch that — try again.");
        resumeAtRef.current = Date.now() + RESUME_COOLDOWN_MS;
        setStatus("idle");
      } else {
        setError("Got your message, but couldn't generate a voice reply.");
        resumeAtRef.current = Date.now() + RESUME_COOLDOWN_MS;
        setStatus("idle");
      }
    } catch {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      setError("Failed to process audio.");
      resumeAtRef.current = Date.now() + RESUME_COOLDOWN_MS;
      setStatus("idle");
    }
  }, [playAudio]);

  // ── One utterance recording ──────────────────────────────────────────────
  // Started automatically by the continuous loop below when it detects
  // speech onset. Stops either when the loop detects trailing silence, or
  // when the user taps the orb mid-utterance to send early.

  const beginUtteranceRecording = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream || isRecordingRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/ogg";

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
    } catch {
      return;
    }

    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];
    isRecordingRef.current = true;
    livePhaseRef.current = "recording";
    maxVolumeRef.current = 0;
    recordingStartRef.current = Date.now();
    lastSpeechTimeRef.current = recordingStartRef.current;
    setStatus("listening");

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      isRecordingRef.current = false;
      livePhaseRef.current = "idle";
      const duration = Date.now() - recordingStartRef.current;
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      if (process.env.NODE_ENV !== "production") {
        console.log(`[MIC] blob size: ${blob.size} bytes, duration: ${duration}ms, peak volume: ${maxVolumeRef.current}`);
      }

      // A blip that doesn't hold up as real speech (background noise,
      // a brief knock) — in a continuous always-on session these should be
      // invisible, not error toasts, since the recording was never
      // something the user deliberately started.
      if (duration <= 300 || maxVolumeRef.current < 6 || blob.size <= 500) {
        resumeAtRef.current = Date.now() + 150;
        setStatus("idle");
        return;
      }

      await sendAudio(blob);
    };

    recorder.start(100);
  }, [sendAudio]);

  const stopCurrentUtterance = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      livePhaseRef.current = "idle";
      setStatus("thinking");
    }
  }, []);

  // ── Continuous listening loop ────────────────────────────────────────────
  // Runs for the lifetime of the session. While idle and live, it watches
  // for speech onset and starts a recording automatically; while recording,
  // it watches for trailing silence and stops automatically. No tap needed
  // between turns — this is what makes it feel like one continuous session
  // instead of a manual record/send dance.

  const runLiveLoopTick = useCallback(() => {
    if (!liveModeRef.current) return;
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(dataArray);
    let peak = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const deviation = Math.abs(dataArray[i] - 128);
      if (deviation > peak) peak = deviation;
    }

    const now = Date.now();

    if (livePhaseRef.current === "idle") {
      // Only start listening for a new turn once the agent has fully
      // finished its own turn, and the brief post-speech cooldown has passed.
      if (statusRef.current !== "idle") return;
      if (now < resumeAtRef.current) return;
      if (peak > SPEECH_VOLUME_THRESHOLD) beginUtteranceRecording();
      return;
    }

    // Actively recording — watch for trailing silence to auto-stop.
    if (peak > maxVolumeRef.current) maxVolumeRef.current = peak;
    if (peak > SPEECH_VOLUME_THRESHOLD) lastSpeechTimeRef.current = now;

    const sinceStart = now - recordingStartRef.current;
    const sinceSpeech = now - lastSpeechTimeRef.current;
    const shouldAutoStop =
      (sinceStart > MIN_RECORDING_MS && sinceSpeech > SILENCE_TIMEOUT_MS) ||
      sinceStart > MAX_RECORDING_MS;

    if (shouldAutoStop && mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      livePhaseRef.current = "idle";
      setStatus("thinking");
    }
  }, [beginUtteranceRecording]);

  const startLiveLoop = useCallback(() => {
    if (liveIntervalRef.current) return;
    liveIntervalRef.current = setInterval(runLiveLoopTick, VOLUME_SAMPLE_MS);
  }, [runLiveLoopTick]);

  const toggleLiveMode = useCallback(() => {
    if (statusRef.current === "listening") {
      // Mid-utterance — a tap here means "I'm done", not "mute". Stop and
      // send immediately instead of waiting for the silence timeout.
      stopCurrentUtterance();
      return;
    }
    if (statusRef.current === "speaking") {
      // Barge in — we actually control this audio element locally, so we can
      // cut it off immediately and return to listening. ("thinking" isn't
      // interruptible the same way: that's an in-flight network request, and
      // stopping locally wouldn't stop the reply from arriving and playing
      // moments later, so the button stays disabled during that phase.)
      stopCurrentAudio();
      resumeAtRef.current = Date.now() + 150;
      setStatus("idle");
      return;
    }
    // Otherwise: idle — toggle the continuous loop on/off (mute/unmute).
    const next = !liveModeRef.current;
    liveModeRef.current = next;
    setLiveMode(next);
    if (next) resumeAtRef.current = Date.now() + 150;
  }, [stopCurrentUtterance, stopCurrentAudio]);

  // ── Start session ─────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setError(null);
    setStatus("idle");
    const sid = await initSession();
    if (!sid) return null;
    connectWS(sid);
    try {
      await getMicStream();
      liveModeRef.current = true;
      setLiveMode(true);
      resumeAtRef.current = Date.now() + 300;
      startLiveLoop();
    } catch {
      // Mic permission denied or unavailable — session still starts (text
      // input keeps working); the orb will show its muted state.
      liveModeRef.current = false;
      setLiveMode(false);
    }
    return sid;
  }, [initSession, connectWS, getMicStream, startLiveLoop]);

  // ── Send text ─────────────────────────────────────────────────────────────

  const sendText = useCallback(async (text: string) => {
    const sid = sessionIdRef.current;
    if (!sid || !text.trim()) return;
    stopCurrentAudio();
    setStatus("thinking");

    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => setStatus("idle"), 25000);

    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sid}/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);

      if (data.reply) {
        // Audio comes via WebSocket audio_chunk — status will update there
      }
      // Status will be set by ws audio_chunk → speaking → idle on end
    } catch {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      setError("Failed to send message.");
      setStatus("idle");
    }
  }, [stopCurrentAudio]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
      wsRef.current?.close();
      if (mediaRecorderRef.current && isRecordingRef.current) {
        mediaRecorderRef.current.stop();
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  return {
    sessionId,
    status,
    transcript,
    profile,
    events,
    handoff,
    isConnected,
    error,
    liveMode,
    start,
    toggleLiveMode,
    sendText,
    isRecording: isRecordingRef,
    getInputLevel,
  };
}
