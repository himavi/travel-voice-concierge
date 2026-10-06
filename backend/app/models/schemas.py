from datetime import datetime
from typing import Literal, Optional
import uuid

from pydantic import BaseModel, Field


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
    # Set when the destination resolves to more than one plausible country:
    # {"field": "destination", "raw": ..., "candidates": [...]}.
    pending_clarification: Optional[dict] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# Fields a client may send back in `seed_profile` to rebuild a lost session.
SEEDABLE_FIELDS = (
    "destination", "passport", "travelers", "travel_month", "travel_dates",
    "purpose", "visa_required", "first_schengen", "budget", "customer_name",
    "intent", "handoff_requested",
)


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class DecisionEvent(BaseModel):
    # INTENT_DETECTED, FIELD_EXTRACTED, QUESTION_GENERATED, LEAD_SCORE_UPDATED,
    # LEAD_QUALIFIED, HANDOFF_REQUESTED, DESTINATION_CLARIFICATION_NEEDED, VISA_CHECKED
    event_type: str
    description: str
    field: Optional[str] = None
    value: Optional[str] = None
    score: Optional[int] = None
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
