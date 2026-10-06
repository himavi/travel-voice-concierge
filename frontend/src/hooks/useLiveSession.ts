"use client";

/**
 * Gemini Live (native speech-to-speech) connection, browser → Google direct.
 *
 * Flow: POST /live-token → GoogleGenAI({apiKey: token}) → ai.live.connect().
 * The token is a 1-use ephemeral token whose config (model, voice, system
 * prompt, tools, transcription, VAD, resumption) is locked server-side, so we
 * send no config here.
 *
 * This hook owns only the WebSocket session. Mic capture and playback live in
 * the orchestrator (useVoiceAgent), which feeds `sendAudio()` and receives
 * audio/transcripts/tool results through the handlers.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FunctionCall, LiveServerMessage, Session } from "@google/genai";
import { api, ApiError } from "@/lib/api";
import { base64ToBytes, pcm16ToBase64 } from "@/lib/audio/wav";
import type { HistoryTurn, ToolFunctionResponse, ToolsTurn } from "@/lib/types";

/** First client turn so Aria greets the caller instead of waiting in silence. */
const GREETING_KICKOFF =
  "(The caller just connected. Greet them warmly as Aria in one short sentence and ask how you can help with their trip.)";
const CONNECT_TIMEOUT_MS = 12000;
/** Live connections are capped near 10 min; hop to a fresh one before that. */
const PROACTIVE_RECONNECT_MS = 9 * 60 * 1000;
const MAX_RECONNECT_ATTEMPTS = 2;

export type LiveFallbackReason =
  | "busy"           // token endpoint 429
  | "token_error"    // token endpoint 5xx / network
  | "connect_failed" // websocket/setup failed or timed out
  | "closed";        // server closed with 1007/1008/1011, or resume kept failing

export interface FinalTurn extends HistoryTurn {
  timestamp: string;
}

export interface LiveSessionHandlers {
  /** Run an API call with the current session id (recreating it on 404). */
  withSession<T>(fn: (sid: string) => Promise<T>): Promise<T>;
  onAudio(pcm: Uint8Array, sampleRate: number): void;
  onInterrupted(): void;
  onModelTurnComplete(): void;
  /** Live (still-growing) transcript for a role; null clears it. */
  onPartial(role: "user" | "assistant", text: string | null, timestamp: string): void;
  onFinalTurns(turns: FinalTurn[]): void;
  onToolsPending(pending: boolean): void;
  onToolsTurn(turn: ToolsTurn): void;
  onFallback(reason: LiveFallbackReason, detail?: string): void;
}

interface Conn {
  session: Session | null;
  ready: boolean;
  closed: boolean;
  /** We closed it on purpose (swap/disconnect) — don't treat as a failure. */
  intentional: boolean;
}

class EarlyCloseError extends Error {
  constructor(readonly code: number, readonly reason: string) {
    super(`Live socket closed before setup (${code}${reason ? ` ${reason}` : ""})`);
  }
}

function parseRate(mime: string | undefined): number {
  const m = /rate=(\d+)/.exec(mime ?? "");
  return m ? Number(m[1]) : 24000;
}

export function useLiveSession(handlers: LiveSessionHandlers) {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });

  const connRef = useRef<Conn | null>(null);
  const activeRef = useRef(false);
  const handleRef = useRef<string | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnecting = useRef(false);
  const toolsPending = useRef(0);
  const turnBuf = useRef({ user: "", userTs: "", assistant: "", assistantTs: "" });

  // ── transcripts ──────────────────────────────────────────────────────────

  const appendTranscript = useCallback((role: "user" | "assistant", delta: string) => {
    const b = turnBuf.current;
    const now = new Date().toISOString();
    if (role === "user") {
      if (!b.userTs) b.userTs = now;
      b.user += delta;
      h.current.onPartial("user", b.user, b.userTs);
    } else {
      if (!b.assistantTs) b.assistantTs = now;
      b.assistant += delta;
      h.current.onPartial("assistant", b.assistant, b.assistantTs);
    }
  }, []);

  /** Move whatever was said into the final transcript and persist it. */
  const commitTurn = useCallback(() => {
    const b = turnBuf.current;
    const turns: FinalTurn[] = [];
    if (b.user.trim()) turns.push({ role: "user", text: b.user.trim(), timestamp: b.userTs });
    if (b.assistant.trim()) turns.push({ role: "assistant", text: b.assistant.trim(), timestamp: b.assistantTs });
    turnBuf.current = { user: "", userTs: "", assistant: "", assistantTs: "" };
    h.current.onPartial("user", null, "");
    h.current.onPartial("assistant", null, "");
    if (turns.length === 0) return;
    h.current.onFinalTurns(turns);
    const payload = turns.map(({ role, text }) => ({ role, text }));
    h.current.withSession((sid) => api.transcript(sid, payload)).catch(() => {
      // Best-effort: losing a transcript POST only thins the handoff summary.
    });
  }, []);

  // ── tools ────────────────────────────────────────────────────────────────

  const handleToolCall = useCallback(async (conn: Conn, calls: FunctionCall[]) => {
    const req = calls.map((c) => ({ id: c.id ?? "", name: c.name ?? "", args: c.args ?? {} }));
    toolsPending.current++;
    h.current.onToolsPending(true);
    let responses: ToolFunctionResponse[];
    try {
      const turn = await h.current.withSession((sid) => api.tools(sid, req));
      h.current.onToolsTurn(turn);
      responses = turn.function_responses;
    } catch (e) {
      // Never leave Gemini waiting on a BLOCKING call (lookup_visa).
      const why = e instanceof ApiError ? e.message : "tool call failed";
      responses = req.map((c) => ({ id: c.id, name: c.name, response: { error: `Tool unavailable (${why})` } }));
    } finally {
      toolsPending.current = Math.max(0, toolsPending.current - 1);
      h.current.onToolsPending(toolsPending.current > 0);
    }
    const target = !conn.closed ? conn : connRef.current;
    if (!activeRef.current || !target?.session || target.closed) return;
    try {
      target.session.sendToolResponse({ functionResponses: responses });
    } catch {
      // socket went away mid-call; resumption will re-issue if needed
    }
  }, []);

  // ── connection lifecycle ─────────────────────────────────────────────────

  const clearTimer = () => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
  };

  const closeConn = (conn: Conn | null) => {
    if (!conn) return;
    conn.intentional = true;
    try {
      conn.session?.close();
    } catch {
      // already closed
    }
  };

  // Mutually recursive pieces (reconnect ↔ open ↔ close handling) go through a
  // ref so the stable callbacks below always call the latest versions.
  const impl = useRef<{
    open(opts: { resume: boolean; greet: boolean }): Promise<boolean>;
    reconnect(why: string): Promise<void>;
    fail(reason: LiveFallbackReason, detail?: string): void;
  } | null>(null);

  const disconnect = useCallback(() => {
    activeRef.current = false;
    clearTimer();
    closeConn(connRef.current);
    connRef.current = null;
    handleRef.current = null;
    reconnecting.current = false;
    toolsPending.current = 0;
    commitTurn();
  }, [commitTurn]);

  const onMessage = useCallback(
    (conn: Conn, msg: LiveServerMessage) => {
      if (!activeRef.current || conn.intentional) return;

      const upd = msg.sessionResumptionUpdate;
      if (upd?.resumable && upd.newHandle) handleRef.current = upd.newHandle;

      if (msg.goAway) void impl.current?.reconnect("goAway");

      if (msg.toolCall?.functionCalls?.length) void handleToolCall(conn, msg.toolCall.functionCalls);

      const sc = msg.serverContent;
      if (!sc) return;
      for (const part of sc.modelTurn?.parts ?? []) {
        const d = part.inlineData;
        if (d?.data && (d.mimeType ?? "").startsWith("audio/")) {
          h.current.onAudio(base64ToBytes(d.data), parseRate(d.mimeType));
        }
      }
      if (sc.inputTranscription?.text) appendTranscript("user", sc.inputTranscription.text);
      if (sc.outputTranscription?.text) appendTranscript("assistant", sc.outputTranscription.text);
      if (sc.interrupted) {
        h.current.onInterrupted();
        commitTurn();
      }
      if (sc.turnComplete) {
        commitTurn();
        h.current.onModelTurnComplete();
      }
    },
    [appendTranscript, commitTurn, handleToolCall],
  );

  const onClose = useCallback((conn: Conn, ev: CloseEvent) => {
    conn.closed = true;
    if (!activeRef.current || conn.intentional || connRef.current !== conn) return;
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[live] socket closed ${ev.code} ${ev.reason}`);
    }
    // 1007 invalid request/auth, 1008 policy (quota, token), 1011 server error:
    // resuming would hit the same wall, so fall back right away.
    if (ev.code === 1007 || ev.code === 1008 || ev.code === 1011) {
      impl.current?.fail("closed", `${ev.code} ${ev.reason}`.trim());
      return;
    }
    // Network drop / server-side end of connection: resume silently.
    void impl.current?.reconnect(`close ${ev.code}`);
  }, []);

  impl.current = {
    fail(reason, detail) {
      if (!activeRef.current) return;
      disconnect();
      h.current.onFallback(reason, detail);
    },

    async open({ resume, greet }) {
      let tok;
      try {
        tok = await h.current.withSession((sid) => api.liveToken(sid, resume ? handleRef.current : null));
      } catch (e) {
        if (!activeRef.current) return false;
        const status = e instanceof ApiError ? e.status : 0;
        impl.current?.fail(status === 429 ? "busy" : "token_error", e instanceof Error ? e.message : undefined);
        return false;
      }
      if (!activeRef.current) return false;

      const conn: Conn = { session: null, ready: false, closed: false, intentional: false };
      let rejectEarly: (e: Error) => void = () => {};
      const early = new Promise<never>((_, reject) => { rejectEarly = reject; });
      let timer: ReturnType<typeof setTimeout> | undefined;
      let gaveUp = false;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Live connect timed out")), CONNECT_TIMEOUT_MS);
      });

      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({
          apiKey: tok.token,
          httpOptions: { apiVersion: tok.api_version || "v1alpha" },
        });
        const connecting = ai.live.connect({
          model: tok.model,
          // No `config`: the ephemeral token pins it server-side.
          callbacks: {
            onmessage: (msg) => onMessage(conn, msg),
            onerror: () => {
              // An error is always followed by onclose; handled there.
            },
            onclose: (ev) => {
              if (!conn.ready) {
                conn.closed = true;
                rejectEarly(new EarlyCloseError(ev.code, ev.reason));
              } else {
                onClose(conn, ev);
              }
            },
          },
        });
        // If we give up (timeout/early close) but connect resolves later, close it.
        connecting.then((s) => { if (gaveUp) s.close(); }).catch(() => {});
        early.catch(() => {});
        timeout.catch(() => {});

        const session = await Promise.race([connecting, early, timeout]);
        conn.session = session;
        conn.ready = true;
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.warn("[live] connect failed", e);
        gaveUp = true;
        conn.intentional = true;
        if (!activeRef.current) return false;
        // A resume attempt is retried by reconnect(); a first connect falls back.
        if (!resume) impl.current?.fail("connect_failed", e instanceof Error ? e.message : undefined);
        return false;
      } finally {
        clearTimeout(timer);
      }

      if (!activeRef.current) {
        closeConn(conn);
        return false;
      }

      // Swap in the new connection; the old one (goAway case) is retired.
      const prev = connRef.current;
      connRef.current = conn;
      if (prev && prev !== conn) closeConn(prev);

      clearTimer();
      reconnectTimer.current = setTimeout(() => void impl.current?.reconnect("max-age"), PROACTIVE_RECONNECT_MS);

      if (greet && conn.session) {
        // Live speaks only after input; a realtime text turn gets a spoken reply
        // (verified against gemini-3.8-live; a clientContent turn did not).
        conn.session.sendRealtimeInput({ text: GREETING_KICKOFF });
      }
      return true;
    },

    async reconnect(why) {
      if (!activeRef.current || reconnecting.current) return;
      reconnecting.current = true;
      if (process.env.NODE_ENV !== "production") console.info(`[live] reconnecting (${why})`);
      try {
        for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
          if (!activeRef.current) return;
          // `open` reports token failures itself (fallback); connect failures
          // on a resume return false so we can retry.
          const ok = await impl.current!.open({ resume: true, greet: false });
          if (ok) return;
          if (!activeRef.current) return;
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
        impl.current?.fail("closed", `resume failed (${why})`);
      } finally {
        reconnecting.current = false;
      }
    },
  };

  // ── public API ───────────────────────────────────────────────────────────

  const connect = useCallback(async (opts: { greet: boolean }): Promise<boolean> => {
    if (activeRef.current) return true;
    activeRef.current = true;
    handleRef.current = null;
    turnBuf.current = { user: "", userTs: "", assistant: "", assistantTs: "" };
    return impl.current!.open({ resume: false, greet: opts.greet });
  }, []);

  /** 16 kHz mono PCM16 chunk from the mic worklet. */
  const sendAudio = useCallback((pcm: Int16Array) => {
    const conn = connRef.current;
    if (!activeRef.current || !conn?.ready || conn.closed || !conn.session) return;
    try {
      conn.session.sendRealtimeInput({ audio: { data: pcm16ToBase64(pcm), mimeType: "audio/pcm;rate=16000" } });
    } catch {
      // socket closing; onclose handles recovery
    }
  }, []);

  /** Tell server VAD the mic stopped (mute / "I'm done" tap). */
  const endAudioStream = useCallback(() => {
    const conn = connRef.current;
    if (!conn?.ready || conn.closed || !conn.session) return;
    try {
      conn.session.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      // ignore
    }
  }, []);

  /** Typed message during a Live session — same conversation, Aria answers by voice. */
  const sendText = useCallback((text: string): boolean => {
    const conn = connRef.current;
    if (!activeRef.current || !conn?.ready || conn.closed || !conn.session) return false;
    try {
      conn.session.sendRealtimeInput({ text });
    } catch {
      return false;
    }
    commitTurn(); // close out anything pending before this typed turn
    const turn: FinalTurn = { role: "user", text, timestamp: new Date().toISOString() };
    h.current.onFinalTurns([turn]);
    h.current.withSession((sid) => api.transcript(sid, [{ role: "user", text }])).catch(() => {});
    return true;
  }, [commitTurn]);

  const isOpen = useCallback(() => {
    const c = connRef.current;
    return activeRef.current && !!c?.ready && !c.closed;
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  return useMemo(
    () => ({ connect, disconnect, sendAudio, endAudioStream, sendText, isOpen }),
    [connect, disconnect, sendAudio, endAudioStream, sendText, isOpen],
  );
}
