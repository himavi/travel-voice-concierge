"""
Groq strict-mode JSON-schema structured output for the per-turn LLM call.

Replaces the old two-call approach (a free-text "return ONLY valid JSON"
extraction prompt parsed with json.loads + markdown-fence stripping, plus a
separate plain-text reply call) with one schema-enforced call that returns
the reply text, extracted profile fields, detected intent, a confidence
score, and a next-action hint together. Groq guarantees ("strict": true)
schema-exact output for openai/gpt-oss-120b, so this is materially more
reliable than the previous prompt-based approach.

Strict mode requires every property to be listed in "required" and
"additionalProperties": false on every object (including nested ones) —
"optional" fields are instead modeled as nullable (type includes "null").
"""

from typing import Optional

from pydantic import BaseModel

INTENTS = [
    "visa_inquiry", "trip_planning", "cost_inquiry",
    "general_info", "human_handoff", "chitchat",
]

NEXT_ACTIONS = [
    "ask_field", "provide_visa_info", "estimate_budget",
    "request_handoff", "clarify_destination", "none",
]

PURPOSES = ["tourism", "business", "education", "medical", "family visit", "other"]


class ProfileUpdates(BaseModel):
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
    handoff_requested: Optional[bool] = None


class TurnResult(BaseModel):
    """Belt-and-suspenders parse of the already schema-validated Groq
    response — intentionally plain `str` fields (not `Literal`) so a parse
    never fails outright on an enum drift; callers that care can check
    membership in INTENTS/NEXT_ACTIONS themselves."""
    reply: str
    intent: Optional[str] = None
    confidence: float = 0.0
    next_action: str = "none"
    profile_updates: ProfileUpdates = ProfileUpdates()


TURN_RESULT_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "turn_result",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["reply", "intent", "confidence", "next_action", "profile_updates"],
            "properties": {
                "reply": {
                    "type": "string",
                    "description": "The spoken reply to the customer. Plain sentences, no markdown.",
                },
                "intent": {
                    "type": ["string", "null"],
                    "enum": INTENTS + [None],
                },
                "confidence": {
                    "type": "number",
                    "description": (
                        "0-1 confidence that the profile_updates extracted this turn are "
                        "correct. Use a low value (<0.5) when you had to infer/guess rather "
                        "than the user stating it plainly."
                    ),
                },
                "next_action": {
                    "type": "string",
                    "enum": NEXT_ACTIONS,
                },
                "profile_updates": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "destination", "passport", "travelers", "travel_month",
                        "travel_dates", "purpose", "visa_required", "first_schengen",
                        "budget", "customer_name", "handoff_requested",
                    ],
                    "properties": {
                        "destination": {"type": ["string", "null"]},
                        "passport": {"type": ["string", "null"]},
                        "travelers": {"type": ["integer", "null"]},
                        "travel_month": {"type": ["string", "null"]},
                        "travel_dates": {"type": ["string", "null"]},
                        "purpose": {"type": ["string", "null"], "enum": PURPOSES + [None]},
                        "visa_required": {"type": ["boolean", "null"]},
                        "first_schengen": {"type": ["boolean", "null"]},
                        "budget": {"type": ["string", "null"]},
                        "customer_name": {"type": ["string", "null"]},
                        "handoff_requested": {"type": ["boolean", "null"]},
                    },
                },
            },
        },
    },
}
