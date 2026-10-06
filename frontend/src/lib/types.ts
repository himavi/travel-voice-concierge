export interface CustomerProfile {
  session_id: string;
  destination: string | null;
  passport: string | null;
  travelers: number | null;
  travel_month: string | null;
  travel_dates: string | null;
  purpose: string | null;
  visa_required: boolean | null;
  first_schengen: boolean | null;
  budget: string | null;
  customer_name: string | null;
  lead_score: number;
  intent: string | null;
  handoff_requested: boolean;
  created_at: string;
  updated_at: string;
}

export interface DecisionEvent {
  event_type: string;
  description: string;
  field?: string;
  value?: string;
  score?: number;
  timestamp: string;
}

export interface TranscriptMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  /** Still being spoken (Live mode) — text may keep growing. */
  partial?: boolean;
}

export interface HandoffCard {
  customer_name: string | null;
  destination: string | null;
  passport: string | null;
  purpose: string | null;
  travel_month: string | null;
  travelers: number | null;
  lead_score: number;
  reason: string;
  conversation_summary: string;
  timestamp: string;
}

export type AgentStatus = "idle" | "listening" | "thinking" | "speaking";

export interface VisaInfo {
  available: boolean;
  visa_required?: boolean | null;
  visa_type?: string;
  processing_time?: string;
  fee?: string;
  validity?: string;
  notes?: string;
  documents?: string[];
}

/** Which voice pipeline is active. */
export type VoiceMode = "live" | "lite" | "text";

/** Backend reachability, from the cold-start /health ping. */
export type BackendState = "waking" | "ready" | "down";

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

/** Common payload returned by /text, /audio and /tools (docs/API.md). */
export interface Turn {
  profile: CustomerProfile;
  events: DecisionEvent[];
  handoff: boolean;
  handoff_card: HandoffCard | null;
  visa: VisaInfo | null;
}

export interface CreateSessionResponse {
  session_id: string;
  greeting: string;
  profile: CustomerProfile;
}

export interface TextTurn extends Turn {
  reply: string;
  audio_b64?: string;
}

export interface AudioTurn extends Turn {
  user_transcript: string;
  reply: string;
  audio_b64?: string;
}

export interface LiveTokenResponse {
  token: string;
  model: string;
  voice: string;
  expires_at: string;
  api_version: string;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolFunctionResponse {
  id: string;
  name: string;
  response: Record<string, unknown>;
}

export interface ToolsTurn extends Turn {
  function_responses: ToolFunctionResponse[];
}
