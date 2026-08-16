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

export interface WSMessage {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}
