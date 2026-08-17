import json
import logging
import os
import time
from datetime import datetime
from typing import List, Optional

from groq import AsyncGroq, RateLimitError
from dotenv import load_dotenv

from app.models.schemas import (
    CustomerProfile,
    ConversationMessage,
    DecisionEvent,
    AgentResponse,
    HandoffCard,
)
from app.tools.lead_scorer import calculate_lead_score, get_next_priority_field, get_missing_fields, LEAD_ALERT_THRESHOLD
from app.tools.geo import resolve_destination, display_country
from app.tools.knowledge_base import lookup as kb_lookup
from app.agent.llm_schema import TurnResult, ProfileUpdates, TURN_RESULT_JSON_SCHEMA
from app.agent.prompts import (
    SYSTEM_PROMPT,
    EXTRACTION_FIELDS_NOTE,
    VISA_GROUNDING_FOUND,
    VISA_GROUNDING_MISSING,
    CLARIFICATION_INSTRUCTION,
    HANDOFF_SUMMARY_PROMPT,
    FALLBACK_QUESTIONS,
    FALLBACK_KEYWORDS,
)
from app.core.retry import with_retries

load_dotenv()

logger = logging.getLogger(__name__)

# Using the 20b variant rather than 120b: both support Groq's strict-mode
# JSON-schema structured outputs (see llm_schema.py), but each model has its
# own independent tokens-per-day quota on the free tier — 120b's 200k/day
# bucket got drained during testing, while 20b's is a separate, untouched
# allowance. Effectively doubles the free daily budget by spreading load
# across two buckets instead of hammering one. llama-3.3-70b-versatile
# (the original model here) is deprecated by Groq (shutoff 2026-08-16).
CHAT_MODEL = "openai/gpt-oss-20b"

_VISA_KEYWORDS = [
    "visa", "document", "processing time", "fee", "requirement",
    "apply", "application", "embassy", "consulate",
]

# Extracted fields the turn call can produce, mapped 1:1 to CustomerProfile
# attribute names. "intent" is handled separately (top-level on TurnResult,
# not part of ProfileUpdates).
_FIELD_MAP = {
    "destination": "destination",
    "passport": "passport",
    "travelers": "travelers",
    "travel_month": "travel_month",
    "travel_dates": "travel_dates",
    "purpose": "purpose",
    "visa_required": "visa_required",
    "first_schengen": "first_schengen",
    "budget": "budget",
    "customer_name": "customer_name",
    "handoff_requested": "handoff_requested",
}

# Below this, a destination/passport extraction is treated as "unconfirmed"
# bookkeeping rather than silently authoritative — the turn prompt (see
# EXTRACTION_FIELDS_NOTE) is already instructed to ask a one-line
# confirmation in its reply when confidence is low; this just makes that
# gated by a real number instead of hoping the model remembers on its own.
CONFIDENCE_CONFIRM_THRESHOLD = 0.6
_CONFIDENCE_GATED_FIELDS = {"destination", "passport"}


class ConversationManager:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"), timeout=15.0)
        self.profile = CustomerProfile(session_id=session_id)
        self.history: List[ConversationMessage] = []
        self.events: List[DecisionEvent] = []
        self.unconfirmed_fields: set[str] = set()

    # ─── Redis (de)serialization — see app/core/session_store.py ───────────

    def to_state(self) -> dict:
        return {
            "profile": json.loads(self.profile.model_dump_json()),
            "history": [json.loads(m.model_dump_json()) for m in self.history],
            "events": [json.loads(e.model_dump_json()) for e in self.events],
            "unconfirmed_fields": sorted(self.unconfirmed_fields),
        }

    @classmethod
    def from_state(cls, session_id: str, state: dict) -> "ConversationManager":
        conv = cls(session_id)
        conv.profile = CustomerProfile(**state["profile"])
        conv.history = [ConversationMessage(**m) for m in state.get("history", [])]
        conv.events = [DecisionEvent(**e) for e in state.get("events", [])]
        conv.unconfirmed_fields = set(state.get("unconfirmed_fields", []))
        return conv

    def _add_event(self, event_type: str, description: str, **kwargs) -> DecisionEvent:
        event = DecisionEvent(
            event_type=event_type,
            description=description,
            **kwargs,
        )
        self.events.append(event)
        return event

    def _is_visa_related(self, user_message: str) -> bool:
        text = user_message.lower()
        if any(k in text for k in _VISA_KEYWORDS):
            return True
        return get_next_priority_field(self.profile) == "whether they need a visa"

    async def process_message(self, user_message: str) -> AgentResponse:
        """Main entry point — process a user message and return agent response."""
        new_events: List[DecisionEvent] = []
        profile_updates = {}

        self.history.append(ConversationMessage(role="user", content=user_message))

        # Deterministic resolution of a pending destination clarification —
        # the turn call is instructed (CLARIFICATION_INSTRUCTION) to extract
        # the customer's answer into profile_updates itself, but that's not
        # guaranteed: it may acknowledge "the Nepal side" conversationally
        # ("Got it, Nepal it is") without actually setting
        # profile_updates.destination, leaving the profile stuck pointing at
        # the original ambiguous raw text. Checking whether the raw message
        # names one of the candidates directly closes that gap regardless of
        # what the extraction call did — same "don't fully trust one LLM
        # call" philosophy as the fallback-question safety net below.
        if self.profile.pending_clarification and self.profile.pending_clarification.get("field") == "destination":
            candidates = self.profile.pending_clarification.get("candidates", [])
            text_lower = user_message.lower()
            matched = next((c for c in candidates if c.lower() in text_lower), None)
            if matched:
                self.profile.destination = matched
                self.profile.pending_clarification = None
                self.profile.updated_at = datetime.utcnow()
                profile_updates["destination"] = matched
                profile_updates["pending_clarification"] = None
                new_events.append(self._add_event(
                    "FIELD_EXTRACTED",
                    f"Destination clarified: {display_country(matched)}",
                    field="destination",
                    value=matched,
                ))

        pre_next_field = get_next_priority_field(self.profile)
        pre_missing_fields = get_missing_fields(self.profile)

        # Extra grounding/instruction system messages injected ahead of the
        # turn call — kept out of SYSTEM_PROMPT itself since they're
        # situational, not always-on.
        extra_system_messages: list[str] = []

        # A pending destination clarification takes priority over anything
        # else the model would otherwise ask about next.
        if self.profile.pending_clarification:
            pc = self.profile.pending_clarification
            candidates = ", ".join(display_country(c) for c in pc.get("candidates", []))
            extra_system_messages.append(
                CLARIFICATION_INSTRUCTION.format(raw=pc.get("raw", ""), candidates=candidates)
            )

        # Visa-question grounding (item 7) — look up the knowledge base
        # *before* the turn call and hand the model verified data (or an
        # explicit "no verified data" instruction) instead of letting it
        # improvise fees/processing-times/documents from its own knowledge.
        if self.profile.destination and self.profile.passport and self._is_visa_related(user_message):
            record = await kb_lookup(self.profile.passport, self.profile.destination)
            if record:
                extra_system_messages.append(VISA_GROUNDING_FOUND.format(
                    record=json.dumps(record, ensure_ascii=False),
                    last_verified=record.get("last_verified", "recently"),
                ))
            else:
                extra_system_messages.append(VISA_GROUNDING_MISSING)

        turn_start = time.perf_counter()
        result = await self._run_turn(user_message, pre_next_field, pre_missing_fields, extra_system_messages)
        latency_ms = (time.perf_counter() - turn_start) * 1000
        ai_text = result.reply

        extracted = result.profile_updates.model_dump(exclude_none=True)
        if extracted:
            updates, extraction_events = self._apply_profile_updates(extracted, result.confidence)
            profile_updates.update(updates)
            new_events.extend(extraction_events)

        # Intent lives at the top level of TurnResult now (structured output,
        # item 5), not inside profile_updates.
        if result.intent and result.intent != self.profile.intent:
            self.profile.intent = result.intent
            profile_updates["intent"] = result.intent
            new_events.append(self._add_event(
                "INTENT_DETECTED",
                f"Intent detected: {result.intent}",
                field="intent",
                value=result.intent,
            ))

        # Destination ambiguity check (item 2) — only when destination
        # actually changed this turn, using the same resolver "the Alps"
        # already goes through (app/tools/geo.py).
        if "destination" in profile_updates:
            resolution = await resolve_destination(profile_updates["destination"])
            if resolution.ambiguous:
                self.profile.pending_clarification = {
                    "field": "destination",
                    "raw": profile_updates["destination"],
                    "candidates": resolution.candidates,
                }
                profile_updates["pending_clarification"] = self.profile.pending_clarification
                new_events.append(self._add_event(
                    "DESTINATION_CLARIFICATION_NEEDED",
                    f"Destination \"{profile_updates['destination']}\" could mean: {', '.join(resolution.candidates)}",
                    field="destination",
                    value=profile_updates["destination"],
                ))
            elif self.profile.pending_clarification and self.profile.pending_clarification.get("field") == "destination":
                self.profile.pending_clarification = None
                profile_updates["pending_clarification"] = None

        # Step 3: Detect handoff intent — only the turn it first flips to
        # True. Using self.profile.handoff_requested directly here would
        # re-fire this event (and, via AgentResponse.handoff below, re-run
        # the handoff-card LLM call and re-open the handoff modal on the
        # frontend) on every subsequent message, not just the first request.
        handoff_just_requested = "handoff_requested" in profile_updates
        if handoff_just_requested:
            new_events.append(self._add_event(
                "HANDOFF_REQUESTED",
                "Customer requested to speak with a human agent",
            ))

        # Step 4: Recalculate lead score
        old_score = self.profile.lead_score
        self.profile.lead_score = calculate_lead_score(self.profile)
        if self.profile.lead_score != old_score:
            new_events.append(self._add_event(
                "LEAD_SCORE_UPDATED",
                f"Lead score updated to {self.profile.lead_score}",
                score=self.profile.lead_score,
            ))

        # Fires only on the turn the score crosses the threshold. Comparing
        # old vs new (not just `self.profile.lead_score >= THRESHOLD`) avoids
        # re-firing every subsequent turn — the same class of bug the
        # HANDOFF_REQUESTED gating above was fixed for. `<=` on the new side
        # means a one-message jump (e.g. 50 -> 90) still fires correctly.
        lead_just_qualified = old_score < LEAD_ALERT_THRESHOLD <= self.profile.lead_score
        if lead_just_qualified:
            new_events.append(self._add_event(
                "LEAD_QUALIFIED",
                f"Lead qualified as hot — score reached {self.profile.lead_score}",
                score=self.profile.lead_score,
            ))

        # Step 5: Figure out what to ask next
        next_field = get_next_priority_field(self.profile)
        missing_fields_after = get_missing_fields(self.profile)
        profile_just_completed = bool(pre_missing_fields) and not missing_fields_after
        new_events.append(self._add_event(
            "QUESTION_GENERATED",
            f"Next priority field: {next_field}",
            field=next_field,
        ))

        # Step 5b: Deterministic safety net — the model is instructed to ask
        # about next_field, but at temp>0 it sometimes ignores that: either
        # wrapping the conversation up with no question at all, or asking
        # about something else entirely (e.g. "want me to start the visa
        # process?" instead of the still-missing purpose). A bare "?" check
        # only catches the first case; checking for topic keywords catches
        # both. Rather than trust a second LLM call to fix what the first one
        # got wrong, append a fixed question so the conversation always keeps
        # moving toward a complete profile. Skipped while a clarification is
        # pending — that question already takes priority.
        if not self.profile.pending_clarification:
            fallback_q = FALLBACK_QUESTIONS.get(next_field)
            if fallback_q:
                keywords = FALLBACK_KEYWORDS.get(next_field, [])
                on_topic = any(k in ai_text.lower() for k in keywords)
                if not on_topic:
                    ai_text = f"{ai_text.rstrip()} {fallback_q}"

        # Step 6: Add assistant message to history
        self.history.append(ConversationMessage(role="assistant", content=ai_text))

        return AgentResponse(
            text=ai_text,
            profile_updates=profile_updates,
            events=new_events,
            handoff=handoff_just_requested,
            lead_alert_triggered=lead_just_qualified,
            next_question_hint=next_field,
            profile_just_completed=profile_just_completed,
            intent=result.intent,
            confidence=result.confidence,
            next_action=result.next_action,
            latency_ms=latency_ms,
        )

    async def _run_turn(
        self,
        user_message: str,
        next_field: str,
        missing_fields: list[str],
        extra_system_messages: list[str],
    ) -> TurnResult:
        """One Groq call, strict-mode JSON-schema structured output (item 5):
        returns the conversational reply plus extracted profile fields,
        intent, confidence, and next_action together — replacing the old
        two-call (free-text extraction + separate reply) approach."""
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": EXTRACTION_FIELDS_NOTE},
        ]

        profile_context = self._build_profile_context()
        if profile_context:
            messages.append({"role": "system", "content": f"Current profile: {profile_context}"})

        if missing_fields:
            messages.append({
                "role": "system",
                "content": (
                    f"Still missing from the profile: {', '.join(missing_fields)}. "
                    f"The conversation is NOT done until these are filled. "
                    f"Ask about \"{next_field}\" next. If the user's last message seems to "
                    f"have already answered it, don't just take that as given and move on — "
                    f"extraction can miss things, so ask a quick one-line confirmation of it "
                    f"instead (e.g. \"Just to confirm, this is a leisure trip?\") rather than "
                    f"silently skipping to the next topic. Only move past an item once it's "
                    f"actually gone from this missing list on a later turn."
                ),
            })
        else:
            messages.append({
                "role": "system",
                "content": (
                    "All required profile fields are captured. You can now wrap up "
                    "naturally, offer a brief helpful summary, or ask if there's "
                    "anything else they need."
                ),
            })

        for extra in extra_system_messages:
            messages.append({"role": "system", "content": extra})

        # Last 6 turns to keep context window lean — the fixed system-prompt
        # overhead already dominates per-turn token cost on Groq's free
        # tier (~1200 tokens before any history at all), so history is kept
        # tighter than the original 10 to stretch the shared daily quota.
        for msg in self.history[-6:]:
            messages.append({"role": msg.role, "content": msg.content})

        async def _call():
            return await self.client.chat.completions.create(
                model=CHAT_MODEL,
                messages=messages,
                temperature=0.3,
                max_tokens=450,
                reasoning_effort="low",
                response_format=TURN_RESULT_JSON_SCHEMA,
            )

        try:
            response = await with_retries(_call, label="llm_turn", no_retry_on=(RateLimitError,))
            raw = response.choices[0].message.content
            return TurnResult.model_validate_json(raw)
        except Exception:
            logger.exception("Turn generation failed for session %s", self.session_id)
            return TurnResult(
                reply="Sorry, I didn't quite catch that — could you say it again?",
                intent=None,
                confidence=0.0,
                next_action="none",
                profile_updates=ProfileUpdates(),
            )

    def _apply_profile_updates(self, extracted: dict, confidence: float) -> tuple[dict, list]:
        """Apply extracted fields to profile, return what changed and events."""
        updates = {}
        events = []

        for key, profile_field in _FIELD_MAP.items():
            if key in extracted and extracted[key] is not None:
                old_val = getattr(self.profile, profile_field, None)
                new_val = extracted[key]

                if old_val != new_val:
                    setattr(self.profile, profile_field, new_val)
                    updates[profile_field] = new_val
                    self.profile.updated_at = datetime.utcnow()

                    # Confidence-gated confirmation (item 6) — the field is
                    # still committed (lead scoring / "what's missing" stay
                    # simple truthiness checks), but flagged as unconfirmed
                    # so a later turn can clear it once the value repeats or
                    # the customer affirms it. The reply itself is already
                    # instructed (EXTRACTION_FIELDS_NOTE) to ask a one-line
                    # confirmation when confidence is low.
                    if profile_field in _CONFIDENCE_GATED_FIELDS and confidence < CONFIDENCE_CONFIRM_THRESHOLD:
                        self.unconfirmed_fields.add(profile_field)
                    else:
                        self.unconfirmed_fields.discard(profile_field)

                    if key == "handoff_requested" and new_val:
                        pass  # handled separately by the caller
                    else:
                        events.append(self._add_event(
                            "FIELD_EXTRACTED",
                            f"{profile_field.replace('_', ' ').title()} identified: {new_val}",
                            field=profile_field,
                            value=str(new_val),
                        ))
                elif profile_field in _CONFIDENCE_GATED_FIELDS and profile_field in self.unconfirmed_fields:
                    # Same value repeated on a later turn — treat that as
                    # the customer implicitly confirming it.
                    self.unconfirmed_fields.discard(profile_field)

        return updates, events

    def _build_profile_context(self) -> str:
        """Summarize known profile for the LLM context injection."""
        parts = []
        if self.profile.customer_name:
            parts.append(f"Name: {self.profile.customer_name}")
        if self.profile.destination:
            parts.append(f"Destination: {self.profile.destination}")
        if self.profile.passport:
            parts.append(f"Passport: {self.profile.passport}")
        if self.profile.purpose:
            parts.append(f"Purpose: {self.profile.purpose}")
        if self.profile.travel_month:
            parts.append(f"Month: {self.profile.travel_month}")
        if self.profile.travel_dates:
            parts.append(f"Dates: {self.profile.travel_dates}")
        if self.profile.travelers:
            parts.append(f"Travelers: {self.profile.travelers}")
        if self.profile.first_schengen is not None:
            parts.append(f"First Schengen: {self.profile.first_schengen}")
        return " | ".join(parts) if parts else ""

    async def get_handoff_card(self) -> HandoffCard:
        """Generate a handoff card summarizing the conversation."""
        conversation_text = "\n".join([
            f"{m.role.upper()}: {m.content}" for m in self.history
        ])
        profile_text = self._build_profile_context()

        prompt = HANDOFF_SUMMARY_PROMPT.format(
            conversation=conversation_text,
            profile=profile_text,
        )

        async def _call():
            return await self.client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=150,
                reasoning_effort="low",
            )

        try:
            response = await with_retries(_call, label="handoff_summary", no_retry_on=(RateLimitError,))
            summary = response.choices[0].message.content.strip()
        except Exception:
            logger.exception("Handoff summary generation failed for session %s", self.session_id)
            summary = f"Customer inquiring about travel to {self.profile.destination or 'unknown destination'}."

        return HandoffCard(
            customer_name=self.profile.customer_name,
            destination=self.profile.destination,
            passport=self.profile.passport,
            purpose=self.profile.purpose,
            travel_month=self.profile.travel_month,
            travelers=self.profile.travelers,
            lead_score=self.profile.lead_score,
            reason="Customer requested human assistance",
            conversation_summary=summary,
        )
