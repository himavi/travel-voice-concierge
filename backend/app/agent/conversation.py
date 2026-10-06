"""
One conversation: the customer profile, transcript history, decision events
and the small bits of state that keep Aria from looping (whether she has
asked for the name, whether the visa KB has been checked).

Every mode funnels its extracted facts through `apply_turn_outputs()`:
- text and voice-lite turns (`process_message` / `process_audio`, one
  Flash-Lite call returning TurnResult JSON);
- Gemini Live tool calls (`agent/tool_executor.py`).
So lead scoring, destination disambiguation, visa checks, handoff and
hot-lead detection behave the same whichever way the customer talks.
"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from google.genai import types

from app.agent import gemini_client
from app.agent.llm_schema import PURPOSES, ProfileUpdates, TurnResult
from app.agent.prompts import (
    AUDIO_MODE_NOTE,
    CLARIFICATION_INSTRUCTION,
    HANDOFF_SUMMARY_PROMPT,
    SYSTEM_PROMPT,
    TEXT_MODE_NOTE,
    VISA_GROUNDING_FOUND,
    VISA_GROUNDING_MISSING,
    VISA_GROUNDING_NONE_YET,
    VISA_GROUNDING_UNVERIFIED_NOTE,
)
from app.core.retry import with_retries
from app.models.schemas import (
    SEEDABLE_FIELDS,
    ConversationMessage,
    CustomerProfile,
    DecisionEvent,
    HandoffCard,
)
from app.tools.geo import display_country, resolve_destination
from app.tools.knowledge_base import lookup as kb_lookup
from app.tools.lead_scorer import (
    LEAD_ALERT_THRESHOLD,
    calculate_lead_score,
    get_missing_fields,
    get_next_priority_field,
    may_ask_name,
)
from app.tools.visa_knowledge import model_visa_payload

logger = logging.getLogger(__name__)

HISTORY_WINDOW = 8          # messages sent to the model per text turn
MAX_HISTORY = 200           # messages kept per session
MAX_MESSAGE_CHARS = 2000

# Profile fields the model/tools may set, with their types.
_STR_FIELDS = ("destination", "passport", "travel_month", "travel_dates", "purpose", "budget", "customer_name")
_BOOL_FIELDS = ("first_schengen",)

_PURPOSE_SYNONYMS = {
    "honeymoon": "tourism", "holiday": "tourism", "vacation": "tourism", "leisure": "tourism",
    "sightseeing": "tourism", "tourist": "tourism", "travel": "tourism", "trip": "tourism",
    "work": "business", "conference": "business", "meeting": "business",
    "study": "education", "studies": "education", "student": "education",
    "treatment": "medical", "family": "family visit", "visiting family": "family visit",
}

# Spotting "what's your name?" in Aria's own replies (all modes, incl. Live
# transcripts), so she asks at most once.
_NAME_ASK_RE = re.compile(
    r"(your name|call you|who am i (speaking|talking) (to|with)|आपका नाम|तुम्हारा नाम|tu nombre|votre nom)",
    re.IGNORECASE,
)

_VISA_WORD_RE = re.compile(r"(visa|वीज़ा|वीजा|visado)", re.IGNORECASE)

FALLBACK_REPLY = "Sorry, I'm having trouble right now. Could you say that again in a moment?"


@dataclass
class TurnOutcome:
    events: list[DecisionEvent] = field(default_factory=list)
    changed: dict = field(default_factory=dict)
    handoff: bool = False                  # first time handoff is requested
    handoff_reason: Optional[str] = None
    lead_alert: bool = False               # first time the score crosses the threshold
    profile_just_completed: bool = False


@dataclass
class ModelTurn:
    reply: str
    outcome: TurnOutcome
    user_transcript: Optional[str] = None
    reply_language: Optional[str] = None
    latency_ms: float = 0.0
    usage: dict = field(default_factory=dict)


def merge_outcomes(first: TurnOutcome, second: TurnOutcome) -> TurnOutcome:
    return TurnOutcome(
        events=first.events + second.events,
        changed={**first.changed, **second.changed},
        handoff=first.handoff or second.handoff,
        handoff_reason=first.handoff_reason or second.handoff_reason,
        lead_alert=first.lead_alert or second.lead_alert,
        profile_just_completed=first.profile_just_completed or second.profile_just_completed,
    )


def asked_for_name(text: str) -> bool:
    return bool(_NAME_ASK_RE.search(text or ""))


def _clean_str(value: Any, limit: int = 120) -> Optional[str]:
    if value is None:
        return None
    text = " ".join(str(value).split())[:limit]
    return text or None


def _normalize_purpose(value: str) -> str:
    p = value.strip().lower()
    if p in PURPOSES:
        return p
    for word, mapped in _PURPOSE_SYNONYMS.items():
        if word in p:
            return mapped
    return "other"


def normalize_updates(raw: dict) -> dict:
    """Validates/cleans fields coming from the model or a tool call. Unknown
    keys and empty values are dropped."""
    out: dict = {}
    for key in _STR_FIELDS:
        val = _clean_str(raw.get(key))
        if val:
            out[key] = _normalize_purpose(val) if key == "purpose" else val
    for key in _BOOL_FIELDS:
        if isinstance(raw.get(key), bool):
            out[key] = raw[key]
    travelers = raw.get("travelers")
    try:
        if travelers is not None and not isinstance(travelers, bool):
            n = int(travelers)
            if 1 <= n <= 100:
                out["travelers"] = n
    except (TypeError, ValueError):
        pass
    if raw.get("handoff_requested") is True:
        out["handoff_requested"] = True
    return out


class ConversationManager:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.profile = CustomerProfile(session_id=session_id)
        self.history: list[ConversationMessage] = []
        self.events: list[DecisionEvent] = []
        self.name_asked = False
        self.visa_checked = False      # KB consulted for the current corridor
        self.lead_alert_sent = False
        self.live_tokens_issued = 0
        self._last_next_field: Optional[str] = None
        self.lock = asyncio.Lock()

    # ─── Persistence (app/core/session_store.py) ────────────────────────────

    def to_state(self) -> dict:
        return {
            "profile": self.profile.model_dump(mode="json"),
            "history": [m.model_dump(mode="json") for m in self.history],
            "events": [e.model_dump(mode="json") for e in self.events[-100:]],
            "name_asked": self.name_asked,
            "visa_checked": self.visa_checked,
            "lead_alert_sent": self.lead_alert_sent,
            "live_tokens_issued": self.live_tokens_issued,
            "last_next_field": self._last_next_field,
        }

    @classmethod
    def from_state(cls, session_id: str, state: dict) -> "ConversationManager":
        conv = cls(session_id)
        conv.profile = CustomerProfile.model_validate(state["profile"])
        conv.history = [ConversationMessage.model_validate(m) for m in state.get("history", [])]
        conv.events = [DecisionEvent.model_validate(e) for e in state.get("events", [])]
        conv.name_asked = state.get("name_asked", False)
        conv.visa_checked = state.get("visa_checked", False)
        conv.lead_alert_sent = state.get("lead_alert_sent", False)
        conv.live_tokens_issued = state.get("live_tokens_issued", 0)
        conv._last_next_field = state.get("last_next_field")
        return conv

    # ─── Session rebuild (client recreates a session lost on restart) ──────

    def seed(self, seed_profile: Optional[dict], history: Optional[list[dict]]) -> None:
        for key in SEEDABLE_FIELDS:
            if seed_profile and seed_profile.get(key) is not None:
                value = seed_profile[key]
                if key in ("visa_required", "first_schengen", "handoff_requested"):
                    if isinstance(value, bool):
                        setattr(self.profile, key, value)
                elif key == "travelers":
                    cleaned = normalize_updates({"travelers": value}).get("travelers")
                    if cleaned:
                        self.profile.travelers = cleaned
                else:
                    cleaned = _clean_str(value)
                    if cleaned:
                        setattr(self.profile, key, cleaned)
        self.profile.lead_score = calculate_lead_score(self.profile)
        # A rebuilt session must not re-alert for a lead that was already hot.
        self.lead_alert_sent = self.profile.lead_score >= LEAD_ALERT_THRESHOLD
        self.visa_checked = self.profile.visa_required is not None
        self.add_transcript(history or [])

    def add_transcript(self, turns: list[dict]) -> int:
        added = 0
        for t in turns:
            role = t.get("role")
            text = _clean_str(t.get("text"), MAX_MESSAGE_CHARS)
            if role not in ("user", "assistant") or not text:
                continue
            self.history.append(ConversationMessage(role=role, content=text))
            if role == "assistant" and asked_for_name(text):
                self.name_asked = True
            added += 1
        if len(self.history) > MAX_HISTORY:
            self.history = self.history[-MAX_HISTORY:]
        return added

    # ─── Shared turn logic ─────────────────────────────────────────────────

    def _add_event(self, event_type: str, description: str, **kwargs) -> DecisionEvent:
        event = DecisionEvent(event_type=event_type, description=description, **kwargs)
        self.events.append(event)
        if len(self.events) > 500:
            self.events = self.events[-500:]
        return event

    def _resolve_pending_clarification(self, user_text: str) -> dict:
        """If a destination clarification is pending and the user's words
        name one of the candidates, take it (whatever the model extracted)."""
        pc = self.profile.pending_clarification
        if not pc or pc.get("field") != "destination" or not user_text:
            return {}
        text = user_text.lower()
        for cand in pc.get("candidates", []):
            if cand.lower() in text or display_country(cand).lower() in text:
                return {"destination": display_country(cand)}
        return {}

    async def apply_turn_outputs(
        self,
        updates: dict,
        *,
        intent: Optional[str] = None,
        handoff_reason: Optional[str] = None,
    ) -> TurnOutcome:
        outcome = TurnOutcome()
        p = self.profile
        missing_before = get_missing_fields(p, visa_checked=self.visa_checked)
        updates = normalize_updates(updates)
        wants_handoff = updates.pop("handoff_requested", False) or bool(handoff_reason)

        corridor_changed = False
        for key, new_val in updates.items():
            if getattr(p, key) == new_val:
                continue
            setattr(p, key, new_val)
            outcome.changed[key] = new_val
            if key in ("destination", "passport"):
                corridor_changed = True
            outcome.events.append(self._add_event(
                "FIELD_EXTRACTED",
                f"{key.replace('_', ' ').title()} identified: {new_val}",
                field=key, value=str(new_val),
            ))

        if intent and intent != p.intent:
            p.intent = intent
            outcome.changed["intent"] = intent
            outcome.events.append(self._add_event(
                "INTENT_DETECTED", f"Intent detected: {intent}", field="intent", value=intent,
            ))

        if "destination" in outcome.changed:
            resolution = await resolve_destination(p.destination)
            if resolution.ambiguous:
                p.pending_clarification = {
                    "field": "destination",
                    "raw": p.destination,
                    "candidates": resolution.candidates,
                }
                outcome.changed["pending_clarification"] = p.pending_clarification
                outcome.events.append(self._add_event(
                    "DESTINATION_CLARIFICATION_NEEDED",
                    f"Destination \"{p.destination}\" could mean: "
                    + ", ".join(display_country(c) for c in resolution.candidates),
                    field="destination", value=p.destination,
                ))
            elif p.pending_clarification:
                p.pending_clarification = None
                outcome.changed["pending_clarification"] = None

        if corridor_changed:
            # A new passport/destination pair invalidates the previous answer.
            if p.visa_required is not None:
                p.visa_required = None
                outcome.changed["visa_required"] = None
            self.visa_checked = False

        await self._check_visa(outcome)

        if wants_handoff and not p.handoff_requested:
            p.handoff_requested = True
            outcome.handoff = True
            outcome.handoff_reason = handoff_reason or "Customer asked to talk to a person"
            outcome.changed["handoff_requested"] = True
            outcome.events.append(self._add_event(
                "HANDOFF_REQUESTED", f"Handoff requested: {outcome.handoff_reason}",
            ))

        old_score = p.lead_score
        p.lead_score = calculate_lead_score(p)
        if p.lead_score != old_score:
            outcome.events.append(self._add_event(
                "LEAD_SCORE_UPDATED", f"Lead score updated to {p.lead_score}", score=p.lead_score,
            ))
        if p.lead_score >= LEAD_ALERT_THRESHOLD and not self.lead_alert_sent:
            self.lead_alert_sent = True
            outcome.lead_alert = True
            outcome.events.append(self._add_event(
                "LEAD_QUALIFIED", f"Lead qualified as hot (score {p.lead_score})", score=p.lead_score,
            ))

        missing_after = get_missing_fields(p, visa_checked=self.visa_checked)
        outcome.profile_just_completed = bool(missing_before) and not missing_after

        next_field = self.next_field()
        if next_field != self._last_next_field:
            self._last_next_field = next_field
            outcome.events.append(self._add_event(
                "QUESTION_GENERATED", f"Next priority: {next_field}", field=next_field,
            ))

        if outcome.changed:
            p.updated_at = datetime.utcnow()
        return outcome

    async def _check_visa(self, outcome: TurnOutcome) -> None:
        """Once passport + destination are known (and unambiguous), consult
        the KB once per corridor and record whether a visa is needed."""
        p = self.profile
        if self.visa_checked or not (p.destination and p.passport) or p.pending_clarification:
            return
        self.visa_checked = True
        record = await kb_lookup(p.passport, p.destination)
        if record is None:
            outcome.events.append(self._add_event(
                "VISA_CHECKED",
                f"No verified visa data for {p.passport} passport to {p.destination}",
                field="visa_required", value="unknown",
            ))
            return
        p.visa_required = bool(record["visa_required"])
        outcome.changed["visa_required"] = p.visa_required
        outcome.events.append(self._add_event(
            "VISA_CHECKED",
            f"Visa {'required' if p.visa_required else 'not required'}: {record.get('visa_type') or ''}".strip(),
            field="visa_required", value=str(p.visa_required),
        ))

    def next_field(self) -> str:
        return get_next_priority_field(self.profile, name_asked=self.name_asked, visa_checked=self.visa_checked)

    # ─── Prompt context ────────────────────────────────────────────────────

    def profile_summary(self) -> str:
        p = self.profile
        parts = []
        for label, value in (
            ("Name", p.customer_name), ("Destination", p.destination), ("Passport", p.passport),
            ("Purpose", p.purpose), ("Month", p.travel_month), ("Dates", p.travel_dates),
            ("Travelers", p.travelers), ("Budget", p.budget),
            ("First Schengen trip", p.first_schengen),
            ("Visa required", p.visa_required),
            ("Handoff already requested", p.handoff_requested or None),
        ):
            if value is not None and value != "":
                parts.append(f"{label}: {value}")
        return " | ".join(parts) if parts else "nothing yet"

    def name_guidance(self) -> str:
        if self.profile.customer_name:
            return f"Their name is {self.profile.customer_name}; use it occasionally."
        if self.name_asked:
            return "You already asked for their name. Never ask for it again."
        if may_ask_name(self.profile, name_asked=self.name_asked):
            return "You may ask for their name once, casually, if it fits naturally. It's optional."
        return "Don't ask for their name yet."

    async def state_block(self) -> str:
        """Current-state notes appended to the system prompt (text and Live)."""
        p = self.profile
        missing = get_missing_fields(p, visa_checked=self.visa_checked)
        lines = [
            "## Current state",
            f"Known so far: {self.profile_summary()}",
            "Still unknown (most important first): " + (", ".join(missing) if missing else "nothing essential"),
            f"Name: {self.name_guidance()}",
        ]
        if p.pending_clarification:
            pc = p.pending_clarification
            lines.append(CLARIFICATION_INSTRUCTION.format(
                raw=pc.get("raw", ""),
                candidates=", ".join(display_country(c) for c in pc.get("candidates", [])),
            ))
        elif p.destination and p.passport:
            record = await kb_lookup(p.passport, p.destination)
            if record is None:
                lines.append(VISA_GROUNDING_MISSING.format(passport=p.passport, destination=p.destination))
            else:
                payload = model_visa_payload(record)
                lines.append(VISA_GROUNDING_FOUND.format(record=json.dumps(payload, ensure_ascii=False)))
                if not payload["verified"]:
                    lines.append(VISA_GROUNDING_UNVERIFIED_NOTE.format(last_verified=record.get("last_verified")))
        else:
            lines.append(VISA_GROUNDING_NONE_YET)
        return "\n".join(lines)

    def recent_contents(self, n: int = HISTORY_WINDOW) -> list[types.Content]:
        contents = []
        for m in self.history[-n:]:
            contents.append(types.Content(
                role="user" if m.role == "user" else "model",
                parts=[types.Part.from_text(text=m.content)],
            ))
        return contents

    # ─── Text / voice-lite turns ───────────────────────────────────────────

    async def process_message(self, user_message: str) -> ModelTurn:
        user_message = user_message.strip()[:MAX_MESSAGE_CHARS]
        self.history.append(ConversationMessage(role="user", content=user_message))
        clarified = self._resolve_pending_clarification(user_message)
        pre = await self.apply_turn_outputs(clarified) if clarified else None
        result, latency_ms, usage = await self._generate(self.recent_contents(), audio=False)
        return await self._finish_turn(result, latency_ms, usage, user_text=user_message, pre=pre)

    async def process_audio(self, wav_bytes: bytes) -> ModelTurn:
        contents = self.recent_contents()
        contents.append(types.Content(role="user", parts=[
            types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
        ]))
        result, latency_ms, usage = await self._generate(contents, audio=True)
        transcript = _clean_str(result.user_transcript, MAX_MESSAGE_CHARS) or ""
        if transcript:
            self.history.append(ConversationMessage(role="user", content=transcript))
        clarified = self._resolve_pending_clarification(transcript)
        pre = await self.apply_turn_outputs(clarified) if clarified else None
        turn = await self._finish_turn(result, latency_ms, usage, user_text=transcript, pre=pre)
        turn.user_transcript = transcript
        return turn

    async def _finish_turn(
        self, result: TurnResult, latency_ms: float, usage: dict, *, user_text: str, pre: Optional[TurnOutcome],
    ) -> ModelTurn:
        updates = result.profile_updates.model_dump(exclude_none=True)
        if pre is not None:
            updates.pop("destination", None)  # the deterministic clarification wins
        intent = result.intent if result.intent else None
        outcome = await self.apply_turn_outputs(updates, intent=intent) if user_text else TurnOutcome()
        if pre is not None:
            outcome = merge_outcomes(pre, outcome)
        if self._needs_grounded_retry(outcome, result):
            # Passport + destination only became known in this very turn, so
            # the prompt had no VISA DATA yet, but the reply talks about visas:
            # regenerate once from the transcript with the KB grounding in.
            retry, retry_ms, retry_usage = await self._generate(self.recent_contents(), audio=False)
            latency_ms += retry_ms
            usage = {"first_call": usage, "grounded_retry": retry_usage}
            if retry.reply and retry.reply != FALLBACK_REPLY:
                result = retry
        reply = (result.reply or "").strip() or FALLBACK_REPLY
        self.history.append(ConversationMessage(role="assistant", content=reply))
        if result.asked_for_name or asked_for_name(reply):
            self.name_asked = True
        if len(self.history) > MAX_HISTORY:
            self.history = self.history[-MAX_HISTORY:]
        return ModelTurn(
            reply=reply, outcome=outcome, reply_language=result.reply_language,
            latency_ms=latency_ms, usage=usage,
        )

    @staticmethod
    def _needs_grounded_retry(outcome: TurnOutcome, result: TurnResult) -> bool:
        corridor_checked_now = any(e.event_type == "VISA_CHECKED" for e in outcome.events)
        return corridor_checked_now and bool(_VISA_WORD_RE.search(result.reply or ""))

    async def _generate(self, contents: list[types.Content], *, audio: bool) -> tuple[TurnResult, float, dict]:
        system = "\n\n".join([
            SYSTEM_PROMPT,
            TEXT_MODE_NOTE,
            AUDIO_MODE_NOTE if audio else "",
            await self.state_block(),
        ]).strip()
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=TurnResult,
            temperature=0.5,
            max_output_tokens=800,
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL),
        )
        client = gemini_client.get_client()

        async def _call():
            return await client.aio.models.generate_content(
                model=gemini_client.TEXT_MODEL, contents=contents, config=config,
            )

        start = time.perf_counter()
        try:
            response = await with_retries(
                _call, label="gemini_turn", timeout_s=20.0 if audio else 12.0,
                give_up_on=gemini_client.is_quota_error,
            )
            usage = gemini_client.usage_dict(response)
            latency_ms = (time.perf_counter() - start) * 1000
            logger.info(
                "gemini turn", extra={
                    "stage": "llm_turn", "session_id": self.session_id, "audio": audio,
                    "latency_ms": round(latency_ms), **usage,
                },
            )
            parsed = response.parsed
            if isinstance(parsed, TurnResult):
                return parsed, latency_ms, usage
            return TurnResult.model_validate_json(response.text), latency_ms, usage
        except Exception as exc:
            logger.warning(
                "Turn generation failed for session %s: %s", self.session_id, type(exc).__name__,
                exc_info=not gemini_client.is_quota_error(exc),
            )
            return (
                TurnResult(reply=FALLBACK_REPLY, profile_updates=ProfileUpdates(), user_transcript=""),
                (time.perf_counter() - start) * 1000,
                {},
            )

    # ─── Handoff card ──────────────────────────────────────────────────────

    async def get_handoff_card(self, reason: Optional[str] = None) -> HandoffCard:
        conversation_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in self.history[-30:])
        prompt = HANDOFF_SUMMARY_PROMPT.format(
            conversation=conversation_text or "(no transcript)", profile=self.profile_summary(),
        )
        client = gemini_client.get_client()

        async def _call():
            return await client.aio.models.generate_content(
                model=gemini_client.TEXT_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    max_output_tokens=200,
                    thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL),
                ),
            )

        try:
            response = await with_retries(
                _call, label="handoff_summary", timeout_s=10.0, give_up_on=gemini_client.is_quota_error,
            )
            logger.info("handoff summary", extra={"stage": "handoff_summary", **gemini_client.usage_dict(response)})
            summary = (response.text or "").strip()
        except Exception as exc:
            logger.warning("Handoff summary failed for session %s: %s", self.session_id, type(exc).__name__)
            summary = ""
        if not summary:
            p = self.profile
            summary = (
                f"Customer is asking about travel to {p.destination or 'an unknown destination'}"
                f"{f' on a {p.passport} passport' if p.passport else ''}."
            )
        p = self.profile
        return HandoffCard(
            customer_name=p.customer_name,
            destination=p.destination,
            passport=p.passport,
            purpose=p.purpose,
            travel_month=p.travel_month or p.travel_dates,
            travelers=p.travelers,
            lead_score=p.lead_score,
            reason=reason or "Customer requested human assistance",
            conversation_summary=summary,
        )
