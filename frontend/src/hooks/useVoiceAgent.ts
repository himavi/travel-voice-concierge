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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── Session init ─────────────────────────────────────────────────────────

  const initSession = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions`, { method: "POST" });
      const data = await res.json();
      setSessionId(data.session_id);
      return data.session_id;
    } catch {
      setError("Could not connect to backend. Is it running?");
      return null;
    }
  }, []);

  // ── WebSocket connection ──────────────────────────────────────────────────

  const connectWS = useCallback((sid: string) => {
    const ws = new WebSocket(`${WS_URL}/ws/${sid}`);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => {
      setError("WebSocket error. Check backend is running.");
    };
  }, []);

  const handleWSMessage = useCallback((msg: { type: string; data: Record<string, unknown>; timestamp: string }) => {
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
        playAudio(msg.data.audio as string);
        break;

      case "error":
        setError(msg.data.message as string);
        break;
    }
  }, []);

  // ── Audio playback ────────────────────────────────────────────────────────

  const playAudio = useCallback((base64: string) => {
    // Stop any playing audio (barge-in)
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

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
    };
  }, []);

  const stopCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  }, []);

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;

    // Stop AI audio immediately (barge-in)
    stopCurrentAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      isRecordingRef.current = true;
      setStatus("listening");

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        isRecordingRef.current = false;
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await sendAudio(blob);
      };

      recorder.start(100);
    } catch {
      setError("Microphone access denied. Please allow microphone access.");
      setStatus("idle");
    }
  }, [stopCurrentAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      setStatus("thinking");
    }
  }, []);

  // ── Send audio to backend ─────────────────────────────────────────────────

  const sendAudio = useCallback(async (blob: Blob) => {
    if (!sessionId) return;
    setStatus("thinking");

    const formData = new FormData();
    formData.append("audio", blob, "audio.webm");

    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/audio`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.audio) {
        playAudio(data.audio);
      }
    } catch {
      setError("Failed to process audio.");
      setStatus("idle");
    }
  }, [sessionId, playAudio]);

  // ── Send text message ────────────────────────────────────────────────────

  const sendText = useCallback(async (text: string) => {
    if (!sessionId || !text.trim()) return;
    stopCurrentAudio();

    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (data.reply) {
        // Text responses still get TTS via WebSocket audio_chunk
      }
    } catch {
      setError("Failed to send message.");
    }
  }, [sessionId, stopCurrentAudio]);

  // ── Start everything ──────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setError(null);
    const sid = await initSession();
    if (!sid) return;
    connectWS(sid);
  }, [initSession, connectWS]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (mediaRecorderRef.current && isRecordingRef.current) {
        mediaRecorderRef.current.stop();
      }
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
