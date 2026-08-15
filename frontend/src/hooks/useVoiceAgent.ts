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

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persistent mic stream + volume metering — acquired once, reused for every
  // recording so pressing the orb doesn't have to wait on getUserMedia each time.
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxVolumeRef = useRef(0);

  // Keep sessionIdRef in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // ── Audio playback ────────────────────────────────────────────────────────

  const stopCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  }, []);

  const playAudio = useCallback((base64: string) => {
    stopCurrentAudio();
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        setStatus("idle");
      };
    } catch {
      setStatus("idle");
    }
  }, [stopCurrentAudio]);

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
  // Acquired once and reused for every recording. Requesting getUserMedia
  // fresh on each press introduced a race: the async permission/device-open
  // step could still be pending when the user released the button, so the
  // "stop" signal fired before `status` had ever flipped to "listening" and
  // was silently dropped — the recording kept running in the background,
  // capturing trailing silence instead of speech.
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

    // Set up volume metering on this stream so we can tell a real silent
    // mic apart from a normal too-short recording instead of guessing.
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

  // ── Start ────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setError(null);
    setStatus("idle");
    const sid = await initSession();
    if (!sid) return null;
    connectWS(sid);
    // Warm up mic permission + stream now so the first press-and-hold
    // doesn't have to wait on getUserMedia (see getMicStream for why that
    // lag matters). Failure here is fine — startRecording will retry and
    // surface a proper error if the user actually denies access.
    getMicStream().catch(() => {});
    return sid;
  }, [initSession, connectWS, getMicStream]);

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;
    stopCurrentAudio();

    try {
      const stream = await getMicStream();

      // Prefer opus/webm, fall back to whatever is supported
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      isRecordingRef.current = true;
      setStatus("listening");

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      // Sample the analyser while recording so we can tell "too short" apart
      // from "no signal at all" (wrong input device, muted mic, etc.)
      maxVolumeRef.current = 0;
      const dataArray = new Uint8Array(analyserRef.current?.fftSize ?? 512);
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = setInterval(() => {
        const analyser = analyserRef.current;
        if (!analyser) return;
        analyser.getByteTimeDomainData(dataArray);
        let peak = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const deviation = Math.abs(dataArray[i] - 128);
          if (deviation > peak) peak = deviation;
        }
        if (peak > maxVolumeRef.current) maxVolumeRef.current = peak;
      }, 100);

      const startTime = Date.now();

      recorder.onstop = async () => {
        if (volumeIntervalRef.current) {
          clearInterval(volumeIntervalRef.current);
          volumeIntervalRef.current = null;
        }
        isRecordingRef.current = false;
        const duration = Date.now() - startTime;
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (process.env.NODE_ENV !== "production") {
          console.log(`[MIC] blob size: ${blob.size} bytes, duration: ${duration}ms, peak volume: ${maxVolumeRef.current}`);
        }

        if (duration <= 300) {
          setError("Recording too short — hold the mic and speak for at least a second.");
          setStatus("idle");
        } else if (maxVolumeRef.current < 6) {
          setError("No sound detected. Check that the correct microphone is selected and isn't muted.");
          setStatus("idle");
        } else if (blob.size <= 500) {
          setError("Recording came through empty — try again.");
          setStatus("idle");
        } else {
          await sendAudio(blob);
        }
      };

      recorder.start(100);
    } catch {
      setError("Microphone access denied. Please allow microphone access.");
      setStatus("idle");
    }
  }, [stopCurrentAudio, getMicStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      setStatus("thinking");
    }
  }, []);

  // ── Send audio ────────────────────────────────────────────────────────────

  const sendAudio = async (blob: Blob) => {
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
      } else {
        setStatus("idle");
      }
    } catch {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      setError("Failed to process audio.");
      setStatus("idle");
    }
  };

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
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
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
    start,
    startRecording,
    stopRecording,
    sendText,
    isRecording: isRecordingRef,
  };
}
