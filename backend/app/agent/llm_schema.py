"""
Structured output for one Flash-Lite turn (text or voice-lite).

Passed to Gemini as `response_schema` with `response_mime_type=
"application/json"`, so the reply, the extracted profile fields and (for
audio) the user's transcript come back together from a single call.
Field order is the order the model generates them in: transcript and
extraction first, then the reply.
"""

from typing import Optional

from pydantic import BaseModel

INTENTS = [
    "visa_inquiry", "trip_planning", "cost_inquiry",
    "general_info", "human_handoff", "chitchat",
]

PURPOSES = ["tourism", "business", "education", "medical", "family visit", "other"]


class ProfileUpdates(BaseModel):
    destination: Optional[str] = None
    passport: Optional[str] = None
    travelers: Optional[int] = None
    travel_month: Optional[str] = None
    travel_dates: Optional[str] = None
    purpose: Optional[str] = None
    first_schengen: Optional[bool] = None
    budget: Optional[str] = None
    customer_name: Optional[str] = None
    handoff_requested: Optional[bool] = None


class TurnResult(BaseModel):
    user_transcript: Optional[str] = None
    profile_updates: ProfileUpdates = ProfileUpdates()
    intent: Optional[str] = None
    reply: str
    reply_language: Optional[str] = None
    asked_for_name: Optional[bool] = None
