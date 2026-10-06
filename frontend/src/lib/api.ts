/** Typed client for the Aria backend (contract: docs/API.md). */
import type {
  AudioTurn,
  CreateSessionResponse,
  CustomerProfile,
  HistoryTurn,
  LiveTokenResponse,
  TextTurn,
  ToolCallRequest,
  ToolsTurn,
} from "./types";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/** Non-2xx response. `status` 0 means the request never got a response. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string | null;
  constructor(status: number, detail: string | null, message?: string) {
    super(message ?? `HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Requests for one session run one at a time. The API runs as serverless
 * functions that load the session, change it and save it back, so two
 * overlapping requests (e.g. /tools and /transcript at the end of a Live turn)
 * could otherwise overwrite each other's changes.
 */
const sessionQueues = new Map<string, Promise<unknown>>();

function request<T>(path: string, init: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const sid = /^\/api\/sessions\/([^/?]+)\//.exec(path)?.[1];
  if (!sid) return send<T>(path, init, timeoutMs);
  const prev = sessionQueues.get(sid) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(() => send<T>(path, init, timeoutMs));
  sessionQueues.set(sid, next.catch(() => undefined));
  return next;
}

async function send<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, { ...init, signal: ctrl.signal });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    throw new ApiError(0, null, aborted ? "Request timed out" : "Network error");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail: string | null = null;
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : null;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const enc = encodeURIComponent;

export const api = {
  health: (timeoutMs = 60000) => request<{ status: string }>("/health", {}, timeoutMs),

  createSession: (body: { seed_profile?: Partial<CustomerProfile>; history?: HistoryTurn[] } = {}) =>
    request<CreateSessionResponse>("/api/sessions", json(body)),

  text: (sid: string, message: string, tts: boolean) =>
    request<TextTurn>(`/api/sessions/${enc(sid)}/text${tts ? "?tts=1" : ""}`, json({ message }), 45000),

  audio: (sid: string, wav: Blob) => {
    const form = new FormData();
    form.append("file", wav, "speech.wav");
    return request<AudioTurn>(`/api/sessions/${enc(sid)}/audio`, { method: "POST", body: form }, 45000);
  },

  liveToken: (sid: string, resumeHandle?: string | null) =>
    request<LiveTokenResponse>(
      `/api/sessions/${enc(sid)}/live-token`,
      json(resumeHandle ? { resume_handle: resumeHandle } : {}),
      15000,
    ),

  tools: (sid: string, calls: ToolCallRequest[]) =>
    request<ToolsTurn>(`/api/sessions/${enc(sid)}/tools`, json({ calls }), 20000),

  transcript: (sid: string, turns: HistoryTurn[]) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(sid)}/transcript`, json({ turns })),
};
