from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
import uuid


class CustomerProfile(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    destination: Optional[str] = None
    passport: Optional[str] = None
    travelers: Optional[int] = None
    travel_month: Optional[str] = None
    travel_dates: Optional[str] = None
    purpose: Optional[str] = None
    visa_required: Optional[bool] = None
    first_schengen: Optional[bool] = None
    budget: Optional[str] = None
    customer_name: Optional[str] = None
    lead_score: int = 0
    intent: Optional[str] = None
    handoff_requested: bool = False
    # Set when the destination the customer gave resolves to more than one
    # plausible country (e.g. a landmark/region outside the known Schengen
    # alias table) — {"field": "destination", "candidates": [...]}. Additive
    # field: the frontend blind-casts profile_update payloads and only reads
    # known keys, so this is inert there until a UI is built for it.
    # `destination` itself is never changed to anything but a plain string.
    pending_clarification: Optional[dict] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class DecisionEvent(BaseModel):
    event_type: str  # INTENT_DETECTED, FIELD_EXTRACTED, FIELD_MISSING, QUESTION_GENERATED, LEAD_SCORE_UPDATED, HANDOFF_REQUESTED, LEAD_QUALIFIED, DESTINATION_CLARIFICATION_NEEDED
    description: str
    field: Optional[str] = None
    value: Optional[str] = None
    score: Optional[int] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentResponse(BaseModel):
    text: str
    profile_updates: dict = {}
    events: List[DecisionEvent] = []
    handoff: bool = False
    lead_alert_triggered: bool = False
    next_question_hint: Optional[str] = None
    profile_just_completed: bool = False
    intent: Optional[str] = None
    confidence: Optional[float] = None
    next_action: Optional[str] = None
    latency_ms: Optional[float] = None


class WSMessage(BaseModel):
    type: str  # "transcript", "agent_response", "profile_update", "decision_event", "handoff", "error", "audio_chunk"
    data: dict
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HandoffCard(BaseModel):
    customer_name: Optional[str]
    destination: Optional[str]
    passport: Optional[str]
    purpose: Optional[str]
    travel_month: Optional[str]
    travelers: Optional[int]
    lead_score: int
    reason: str
    conversation_summary: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
