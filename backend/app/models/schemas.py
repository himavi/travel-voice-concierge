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
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class DecisionEvent(BaseModel):
    event_type: str  # INTENT_DETECTED, FIELD_EXTRACTED, FIELD_MISSING, QUESTION_GENERATED, LEAD_SCORE_UPDATED, HANDOFF_REQUESTED, LEAD_QUALIFIED
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
