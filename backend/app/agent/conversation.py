import asyncio
import json
import logging
import os
import re
from datetime import datetime
from typing import List, Optional

from groq import AsyncGroq
from dotenv import load_dotenv

from app.models.schemas import (
    CustomerProfile,
    ConversationMessage,
    DecisionEvent,
    AgentResponse,
    HandoffCard,
)
from app.tools.lead_scorer import calculate_lead_score, get_next_priority_field, get_missing_fields, LEAD_ALERT_THRESHOLD
from app.tools.visa_knowledge import get_visa_info
from app.agent.prompts import SYSTEM_PROMPT, PROFILE_EXTRACTION_PROMPT, HANDOFF_SUMMARY_PROMPT

load_dotenv()

logger = logging.getLogger(__name__)

# llama-3.3-70b-versatile is deprecated by Groq (shutoff 2026-08-16) — use their
# recommended replacement instead.
CHAT_MODEL = "openai/gpt-oss-120b"


class ConversationManager:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
        self.profile = CustomerProfile(session_id=session_id)
        self.history: List[ConversationMessage] = []
        self.events: List[DecisionEvent] = []

    def _add_event(self, event_type: str, description: str, **kwargs) -> DecisionEvent:
        event = DecisionEvent(
            event_type=event_type,
            description=description,
            **kwargs,
        )
        self.events.append(event)
        return event

    async def process_message(self, user_message: str) -> AgentResponse:
        """Main entry point — process a user message and return agent response."""
        new_events: List[DecisionEvent] = []
        profile_updates = {}

        # Step 1: Add user message to history first, so both Groq calls below
        # see it as part of the conversation.
        self.history.append(ConversationMessage(role="user", content=user_message))

        # Step 2: Extraction and the conversational reply are independent Groq
        # calls — run them concurrently instead of back-to-back to roughly
        # halve per-turn latency. Trade-off: the reply's "Current profile"
        # context note reflects the profile as of the *start* of this turn
        # (pre-extraction). That's fine because the user's raw message — the
        # thing that actually changed — is already in the history the reply
        # call reads, so the model still responds to it naturally.
        #
        # next_field/missing_fields are computed from pre-extraction state
        # for the same reason, and handed to the reply call explicitly —
        # otherwise the model has to re-infer what's still missing purely by
        # rereading the transcript every turn, with nothing forcing it to
        # keep going instead of drifting into open-ended chat once the
        # conversation "feels" complete.
        pre_next_field = get_next_priority_field(self.profile)
        pre_missing_fields = get_missing_fields(self.profile)
        extracted, ai_text = await asyncio.gather(
            self._extract_profile(user_message),
            self._get_ai_response(pre_next_field, pre_missing_fields),
        )

        if extracted:
            updates, extraction_events = self._apply_profile_updates(extracted)
            profile_updates.update(updates)
            new_events.extend(extraction_events)

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
        new_events.append(self._add_event(
            "QUESTION_GENERATED",
            f"Next priority field: {next_field}",
            field=next_field,
        ))

        # Step 6: Add assistant message to history
        self.history.append(ConversationMessage(role="assistant", content=ai_text))

        return AgentResponse(
            text=ai_text,
            profile_updates=profile_updates,
            events=new_events,
            handoff=handoff_just_requested,
            lead_alert_triggered=lead_just_qualified,
            next_question_hint=next_field,
        )

    async def _extract_profile(self, message: str) -> dict:
        """Use LLM to extract structured profile data from raw message."""
        prompt = PROFILE_EXTRACTION_PROMPT.format(message=message)
        try:
            response = await self.client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=300,
                reasoning_effort="low",
            )
            raw = response.choices[0].message.content.strip()

            # Strip markdown code fences if present
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

            return json.loads(raw)
        except Exception:
            logger.exception("Profile extraction failed for session %s", self.session_id)
            return {}

    def _apply_profile_updates(self, extracted: dict) -> tuple[dict, list]:
        """Apply extracted fields to profile, return what changed and events."""
        updates = {}
        events = []

        field_map = {
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
            "intent": "intent",
        }

        for key, profile_field in field_map.items():
            if key in extracted and extracted[key] is not None:
                old_val = getattr(self.profile, profile_field, None)
                new_val = extracted[key]

                if old_val != new_val:
                    setattr(self.profile, profile_field, new_val)
                    updates[profile_field] = new_val
                    self.profile.updated_at = datetime.utcnow()

                    if key == "intent":
                        events.append(self._add_event(
                            "INTENT_DETECTED",
                            f"Intent detected: {new_val}",
                            field="intent",
                            value=str(new_val),
                        ))
                    elif key == "handoff_requested" and new_val:
                        pass  # handled separately
                    else:
                        events.append(self._add_event(
                            "FIELD_EXTRACTED",
                            f"{profile_field.replace('_', ' ').title()} identified: {new_val}",
                            field=profile_field,
                            value=str(new_val),
                        ))

        return updates, events

    async def _get_ai_response(self, next_field: str, missing_fields: list[str]) -> str:
        """Get conversational response from LLM."""
        # Build messages for the LLM
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Add profile context as a system note
        profile_context = self._build_profile_context()
        if profile_context:
            messages.append({
                "role": "system",
                "content": f"Current profile: {profile_context}"
            })

        # Explicitly tell the model what's still missing and what to ask
        # next — without this it has to re-infer the gap from the raw
        # transcript every turn, which is exactly what let conversations
        # trail off before the profile was actually complete.
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

        # Add conversation history (last 10 turns to keep context window lean)
        for msg in self.history[-10:]:
            messages.append({"role": msg.role, "content": msg.content})

        try:
            response = await self.client.chat.completions.create(
                model=CHAT_MODEL,
                messages=messages,
                temperature=0.7,
                max_tokens=200,
                reasoning_effort="low",
            )
            return response.choices[0].message.content.strip()
        except Exception:
            logger.exception("AI response generation failed for session %s", self.session_id)
            return "Sorry, I didn't quite catch that — could you say it again?"

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

        try:
            response = await self.client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=150,
                reasoning_effort="low",
            )
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
